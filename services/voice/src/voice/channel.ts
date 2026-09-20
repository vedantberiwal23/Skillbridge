import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { config } from '../config.js';
import { verifyToken, type VoiceUser } from '../auth/cognito.js';
import { ModelError } from '../bedrock/stream.js';
import { isLanguage } from '../sarvam/client.js';
import { recordTurn, recordSession } from '../lib/telemetry.js';
import { grounderFor } from './grounding.js';
import { createTurn, type Turn, type TurnOptions } from './turn.js';

/**
 * The live voice channel.  ws://<service>/voice/stream
 *
 * A channel is warmed when the panel OPENS, not at button-down: TCP, TLS, the
 * HTTP upgrade and token verification all happen while the worker is still
 * deciding what to ask, so button-down has nothing left to do but listen. A
 * channel also outlives a turn, so the second question is as fast as the first.
 *
 * Wire protocol — client → server:
 *   { t: 'start',  token }              panel open; authenticates the channel
 *   { t: 'begin',  language, history }  button down  (+ optional explicit,
 *                                       part, machine)
 *   { t: 'audio',  b64 }                50ms linear16 @16k frames
 *   { t: 'stop' }                       button up
 *   { t: 'cancel' }                     turn abandoned
 *   { t: 'ask', text, language, history }  a TYPED question (+ part, machine):
 *                                       no audio, answered and spoken exactly
 *                                       like a spoken one, then `done`
 *
 * Server → client:
 *   ready, listening, partial, final, thinking, delta,
 *   audio_start { rate }, audio { seq, b64 }, audio_end,
 *   say { i, text, audio } (fallback clips, play by i),
 *   reply, empty, expired, error, done
 *
 * 50ms frames rather than the 100ms Sarvam suggests: that buffer is paid on the
 * FIRST word, which is the one being watched for.
 */

export const PATH = '/voice/stream';

/** A turn is a few seconds of audio; past this it is a stuck button, not a question. */
const MAX_AUDIO_FRAMES = 800;

/** One channel serves one panel. */
const MAX_SOCKETS_PER_USER = 3;

/**
 * A warmed channel is authenticated once and held across several questions — so
 * it must not live long enough for that authorization to go stale. On expiry the
 * client silently warms a fresh one, which re-verifies the token.
 */
/**
 * Transport keepalive, well under the 60 s an Application Load Balancer counts
 * as idle before it drops a connection.
 *
 * This is NOT a session extension. `CHANNEL_IDLE_MS` and `CHANNEL_MAX_MS` are a
 * security bound — the only thing stopping a revoked or role-changed user from
 * holding a live authorized socket — so the ping deliberately does not call
 * `bump()`. It keeps the TCP connection warm between a worker's questions and
 * nothing more; a channel that goes quiet still expires exactly on schedule.
 *
 * `VOICE_PING_MS` exists so a test can watch the keepalive without waiting 25
 * seconds for it. It is not a deployment knob: nothing sets it in CDK, and the
 * default is what runs in production.
 */
const PING_INTERVAL_MS = Number(process.env.VOICE_PING_MS ?? 25 * 1000);

const CHANNEL_MAX_MS = 15 * 60 * 1000;
const CHANNEL_IDLE_MS = 5 * 60 * 1000;

/** A socket that never authenticates is not a channel. */
const START_TIMEOUT_MS = 10_000;

/** Test seam: replaces Bedrock / the KB / persistence for the whole channel. */
export interface ChannelDeps {
  readonly streamText?: TurnOptions['streamText'];
  readonly grounder?: typeof grounderFor;
  readonly verify?: typeof verifyToken;
  /** Stubbed in tests so a channel under test reaches no table. */
  readonly recordTurn?: typeof recordTurn;
  readonly recordSession?: typeof recordSession;
}

const isLoopback = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

/**
 * Exact-match allowlist. A missing Origin is allowed outside production only:
 * CLI tools and tests send none, a browser always sends one. The loopback
 * exemption is gated on config.isProd, never on the origin string.
 */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return !config.isProd;
  if (config.allowedOrigins.includes(origin)) return true;
  return !config.isProd && isLoopback(origin);
}

/**
 * Attach the WebSocket endpoint to the HTTP server.
 *
 * Takes the http.Server, not the Express app: a WebSocket arrives as a protocol
 * upgrade and never reaches Express middleware. That also means this path gets
 * no rate limiting, no body parsing and no 401 handling for free — auth and
 * limits are re-implemented here deliberately.
 *
 * The Origin check is not optional. A WebSocket is not subject to the
 * same-origin policy and an upgrade never reaches CORS middleware, so without it
 * any site on the internet could open a socket here. The loopback exemption is
 * hard-gated on NODE_ENV.
 */
export function attach(server: Server, deps: ChannelDeps = {}): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
  const perUser = new Map<string, number>();

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    } catch {
      pathname = req.url ?? '';
    }
    if (pathname !== PATH) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    // Before any frame is read.
    if (!originAllowed(req.headers.origin)) {
      console.warn('[voice/channel] refused upgrade from origin:', req.headers.origin ?? '(none)');
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, perUser, deps));
  });

  return wss;
}

export function handleConnection(
  ws: WebSocket,
  perUser: Map<string, number> = new Map(),
  deps: ChannelDeps = {}
): void {
  const verify = deps.verify ?? verifyToken;
  const makeGrounder = deps.grounder ?? grounderFor;
  const saveTurn = deps.recordTurn ?? recordTurn;
  const saveSession = deps.recordSession ?? recordSession;

  let user: VoiceUser | null = null;
  let started = false;
  let counted = false;
  let turn: Turn | null = null;
  let busy = false;
  let closed = false;
  let frames = 0;

  /**
   * A channel is a session. The id is minted at `start` rather than at the
   * upgrade, so a socket that never authenticates leaves nothing behind.
   *
   * `sessionStartedAt` becomes the `<ts>` in `SESSION#<ts>#<sessionId>`, so
   * sessions list in the order they began rather than the order they ended.
   */
  let sessionId = '';
  let sessionStartedAt = '';
  let turns = 0;
  let answered = 0;
  const languages = new Set<string>();
  // The language heard on this channel's last question: a worker who asked in
  // Marathi once will very likely ask in Marathi again, and knowing it lets the
  // next early start answer in Marathi instead of restarting.
  let lastLanguage: string | null = null;
  let ground: ReturnType<typeof grounderFor> | undefined;

  const send = (obj: Record<string, unknown>) => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* best effort */
    }
  };
  const fail = (message: string, code?: string) => send({ t: 'error', message, code: code ?? null });

  /** End the whole channel politely, so the client warms a fresh one. */
  const expire = () => {
    send({ t: 'expired' });
    ws.close();
  };

  let idle: NodeJS.Timeout | undefined;
  const bump = () => {
    clearTimeout(idle);
    idle = setTimeout(expire, CHANNEL_IDLE_MS);
  };
  const lifetime = setTimeout(expire, CHANNEL_MAX_MS);
  // `ws` answers an incoming pong itself; this only has to generate traffic.
  const ping = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
  }, PING_INTERVAL_MS);
  const unauthenticated = setTimeout(() => {
    if (!user) ws.close();
  }, START_TIMEOUT_MS);
  let tokenExpiry: NodeJS.Timeout | undefined;

  /** One turn — spoken (`text` null) or typed — bound to this channel's verified identity. */
  const newTurn = (msg: Record<string, unknown>, text: string | null): Turn => {
    frames = 0;
    turns += 1;
    // Captured now so the callback cannot observe a later `user`. The channel
    // is bound to one identity for its whole life, but reading it out here
    // makes that independent of anything the turn does.
    const { userId, orgId } = user!;
    const currentSession = sessionId;
    const language = typeof msg.language === 'string' && isLanguage(msg.language) ? msg.language : 'hi-IN';
    // An explicit pick beats inference; otherwise what was heard last. A typed
    // question has no recogniser to detect its language, so the language the
    // worker is using the app in is taken as known.
    const known = (msg.explicit === true || text !== null) && isLanguage(language) ? language : lastLanguage;
    return createTurn({
      send,
      fail,
      language,
      history: Array.isArray(msg.history) ? msg.history : [],
      known,
      onHeard: (l) => {
        lastLanguage = l;
      },
      ground,
      part: typeof msg.part === 'string' ? msg.part : null,
      // What the worker is looking at. Clamped and stripped like `part`: it is
      // client-supplied context, never an instruction.
      machine: typeof msg.machine === 'string' ? msg.machine : null,
      text,
      streamText: deps.streamText,
      /**
       * The turn reports what happened; the tenant and the worker come from
       * the VERIFIED token held by this channel, never from anything the
       * client sent. `recordTurn` hands the write off without awaiting, so
       * this returns immediately and the turn path is unaffected.
       */
      record: (completed) => {
        answered += 1;
        if (completed.spokenLanguage) languages.add(completed.spokenLanguage);
        saveTurn({ ...completed, userId, orgId, sessionId: currentSession });
      },
    });
  };

  /** Finish the current turn and report it. The CHANNEL survives the turn. */
  const runTurn = async () => {
    if (busy || !turn) return;
    busy = true;
    const current = turn;
    try {
      await current.finish();
    } catch (e) {
      if (e instanceof ModelError) fail(e.message, e.code);
      else {
        console.error('[voice/channel] turn failed:', (e as Error).message);
        fail('voice turn failed');
      }
    } finally {
      // Only the turn's own sockets close.
      current.cancel();
      turn = null;
      busy = false;
      if (!closed) send({ t: 'done' });
    }
  };

  ws.on('message', async (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    bump();

    /* ── start: authenticate the CHANNEL, once ── */
    if (msg.t === 'start') {
      if (started) return;
      started = true;
      let verified: VoiceUser;
      try {
        verified = await verify(String(msg.token ?? ''));
      } catch (e) {
        const err = e as { message: string; code?: string };
        fail(err.message, err.code ?? 'UNAUTHORIZED');
        ws.close();
        return;
      }
      if (closed) return;

      const open = perUser.get(verified.userId) ?? 0;
      if (open >= MAX_SOCKETS_PER_USER) {
        fail('too many voice sessions open', 'BUSY');
        ws.close();
        return;
      }
      perUser.set(verified.userId, open + 1);
      counted = true;
      user = verified;
      sessionId = randomUUID();
      sessionStartedAt = new Date().toISOString();
      clearTimeout(unauthenticated);

      // Mid-session token expiry ends the whole CHANNEL — no in-place refresh,
      // not just the current turn. The client warms a new one, which re-verifies.
      const remaining = verified.expiresAt - Date.now();
      if (remaining <= 0) return expire();
      if (remaining < CHANNEL_MAX_MS) tokenExpiry = setTimeout(expire, remaining);

      // Bound to the VERIFIED orgId. Also warms the org's KB id lookup now,
      // while the worker is still deciding what to ask.
      ground = makeGrounder(verified.orgId);
      send({ t: 'ready' });
      return;
    }

    if (!user) return;

    /* ── begin: button down, one turn ── */
    if (msg.t === 'begin') {
      if (busy || turn) return;
      turn = newTurn(msg, null);
      send({ t: 'listening' });
      return;
    }

    /* ── ask: a typed question — the same turn, with no audio to wait for ── */
    if (msg.t === 'ask') {
      if (busy || turn) return;
      const text = typeof msg.text === 'string' ? msg.text.trim() : '';
      if (!/\p{L}/u.test(text)) {
        send({ t: 'empty', note: 'type a question first' });
        send({ t: 'done' });
        return;
      }
      turn = newTurn(msg, text);
      await runTurn();
      return;
    }

    if (!turn) return;

    if (msg.t === 'audio') {
      if (++frames > MAX_AUDIO_FRAMES) return;
      if (typeof msg.b64 === 'string' && msg.b64) turn.sendAudio(msg.b64);
      return;
    }

    if (msg.t === 'stop') {
      await runTurn();
      return;
    }

    if (msg.t === 'cancel') {
      if (!busy) {
        turn.cancel();
        turn = null;
      }
    }
  });

  const teardown = () => {
    if (closed) return;
    closed = true;
    clearTimeout(idle);
    clearTimeout(lifetime);
    clearInterval(ping);
    clearTimeout(unauthenticated);
    clearTimeout(tokenExpiry);
    if (counted && user) {
      const n = (perUser.get(user.userId) ?? 1) - 1;
      if (n <= 0) perUser.delete(user.userId);
      else perUser.set(user.userId, n);
      counted = false;
    }
    // One SESSION# item per channel, written as it closes — that is the only
    // moment the turn count and duration are known. A socket that never
    // authenticated has no identity to file it under and leaves nothing.
    //
    // Sessions that opened the panel and asked nothing are still recorded:
    // "warmed a channel and said nothing" is a real signal about the mic or the
    // UI, and inferring it later from an absence is impossible.
    if (user && sessionId) {
      saveSession({
        userId: user.userId,
        orgId: user.orgId,
        sessionId,
        startedAt: sessionStartedAt,
        turns,
        answered,
        languages: [...languages],
      });
      sessionId = '';
    }
    turn?.cancel();
  };
  ws.on('close', teardown);
  ws.on('error', teardown);

  bump();
}
