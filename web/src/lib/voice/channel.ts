/**
 * Transport to the voice service (services/voice, App Runner).
 *
 *   openVoiceChannel()    when the PANEL opens. Connects, authenticates, then
 *                         waits. TCP, TLS, the upgrade and token verification all
 *                         happen seconds before anyone presses anything.
 *   channel.startTurn()   button down. One frame and the mic; nothing left to
 *                         wait for. A channel outlives a turn.
 *
 * The panel UI is the frontend track's; this module owns only the socket, the
 * mic and playback. Errors surface as codes so the panel can route them through
 * t(). Browser-only.
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import type { ScreenContext } from './context';
import { startMic, type Mic } from './mic';
import * as player from './player';

const OPEN_TIMEOUT_MS = 4000;
/** Refresh before connecting if the token has less than this left. */
const EXPIRY_MARGIN_S = 90;

export function voiceStreamUrl(): string {
  const base = (process.env.NEXT_PUBLIC_VOICE_URL ?? 'http://localhost:3002').replace(/\/$/, '');
  return `${base}/voice/stream`.replace(/^http/i, 'ws');
}

/**
 * The ID token — it carries custom:orgId; the access token does not. It goes
 * in the first FRAME, never the URL: query strings land in proxy logs and
 * browser history.
 */
/** Never let a hung auth call strand the channel at "connecting" with no socket. */
const TOKEN_TIMEOUT_MS = 6000;

async function idToken(): Promise<string | null> {
  try {
    let session = await Promise.race([
      fetchAuthSession(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('auth timed out')), TOKEN_TIMEOUT_MS)
      ),
    ]);
    const exp = session.tokens?.idToken?.payload.exp;
    if (!exp || exp - Date.now() / 1000 < EXPIRY_MARGIN_S) session = await fetchAuthSession({ forceRefresh: true });
    return session.tokens?.idToken?.toString() ?? 'dev-token';
  } catch {
    return 'dev-token';
  }
}

export type ChannelState = 'connecting' | 'ready' | 'unavailable' | 'closed';

/** Codes after which reconnecting would fail the same way. */
const FATAL = new Set(['UNAUTHORIZED', 'FORBIDDEN', 'BUSY', 'UNAVAILABLE']);

export interface TurnHandlers {
  /** The recogniser is up; audio captured before now was queued, not lost. */
  onListening?: () => void;
  /** Words while still speaking. Interim, revised as it goes. */
  onPartial?: (text: string) => void;
  onFinal?: (text: string, language: string | null) => void;
  onThinking?: () => void;
  onDelta?: (text: string) => void;
  onReply?: (reply: { transcript: string; text: string; language: string; grounded: boolean }) => void;
  /** Nothing with letters was heard — silence is not a question. */
  onEmpty?: () => void;
  onError?: (code: string | null, message: string) => void;
  onLevel?: (level: number) => void;
  onDone?: () => void;
}

export interface TurnOptions {
  /** From VOICE_LANGUAGE[locale] — the one language setting (CLAUDE.md: no second picker). */
  language: string;
  /** True when the worker explicitly chose the language, rather than it being a default. */
  explicit?: boolean;
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** Label of the tapped hotspot, from MachineViewer's onPartSelected. */
  part?: string | null;
  /**
   * The machine the worker is looking at — the one they uploaded, scanned or
   * opened. "What is this?" has no subject without it.
   */
  machine?: string | null;
  /**
   * What the screen is showing — lesson, machine, the selected part and its
   * description, the steps in view. Without it the tutor has nothing to bind
   * "this" to and answers the question generically.
   */
  context?: ScreenContext | null;
}

export interface VoiceTurn {
  stop(): void;
  cancel(): void;
}

export interface VoiceChannel {
  state(): ChannelState;
  /** Call SYNCHRONOUSLY from the press handler — it unlocks audio on mobile. */
  startTurn(options: TurnOptions, handlers: TurnHandlers): VoiceTurn;
  /**
   * A typed question on the same channel: answered, grounded and SPOKEN exactly
   * like a spoken one, with no microphone. Call from a click handler — it
   * unlocks audio playback like startTurn. Returns false if the channel is not
   * ready or a turn is already running (onError is called with NOT_READY).
   */
  ask(text: string, options: TurnOptions, handlers: TurnHandlers): boolean;
  close(): void;
}

export function openVoiceChannel(opts: {
  onState?: (s: ChannelState) => void;
  onFatal?: (code: string, message: string) => void;
} = {}): VoiceChannel {
  let ws: WebSocket | null = null;
  let state: ChannelState = 'connecting';
  let closedByUs = false;
  let handlers: TurnHandlers | null = null;
  let mic: Mic | null = null;

  const setState = (s: ChannelState) => {
    state = s;
    opts.onState?.(s);
  };
  const stopMic = () => {
    mic?.stop();
    mic = null;
  };
  const endTurn = () => {
    stopMic();
    const h = handlers;
    handlers = null;
    h?.onDone?.();
  };

  const connect = async () => {
    setState('connecting');
    let token: string | null;
    try {
      token = await idToken();
    } catch {
      token = null;
    }
    if (closedByUs) return;
    if (!token) {
      setState('closed');
      opts.onFatal?.('UNAUTHORIZED', 'sign in required');
      return;
    }

    const sock = new WebSocket(voiceStreamUrl());
    ws = sock;
    const timer = setTimeout(() => {
      if (state !== 'ready') {
        sock.close();
        setState('unavailable');
      }
    }, OPEN_TIMEOUT_MS);

    sock.onopen = () => sock.send(JSON.stringify({ t: 'start', token }));

    sock.onmessage = (ev) => {
      let m: Record<string, unknown> & { t?: string };
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const h = handlers;
      switch (m.t) {
        case 'ready':
          clearTimeout(timer);
          setState('ready');
          break;
        case 'listening':
          h?.onListening?.();
          break;
        case 'partial':
          h?.onPartial?.(String(m.text ?? ''));
          break;
        case 'final':
          h?.onFinal?.(String(m.text ?? ''), (m.language as string) ?? null);
          break;
        case 'thinking':
          h?.onThinking?.();
          break;
        case 'delta':
          h?.onDelta?.(String(m.text ?? ''));
          break;
        case 'audio_start':
          player.beginStream(Number(m.rate));
          break;
        case 'audio':
          player.pushPcm(Number(m.seq), String(m.b64 ?? ''));
          break;
        case 'say':
          player.enqueueClip(Number(m.i), (m.audio as string | null) ?? null);
          break;
        case 'reply':
          h?.onReply?.(m as never);
          break;
        case 'empty':
          stopMic();
          h?.onEmpty?.();
          break;
        case 'expired':
          // Channel lifetime or token expiry. Warm a fresh one (re-verifies);
          // the worker never sees this unless a turn was mid-flight.
          if (handlers) endTurn();
          break;
        case 'error': {
          const code = (m.code as string | null) ?? null;
          h?.onError?.(code, String(m.message ?? ''));
          if (code && FATAL.has(code)) {
            closedByUs = true;
            setState('closed');
            opts.onFatal?.(code, String(m.message ?? ''));
          }
          break;
        }
        case 'done':
          endTurn();
          break;
      }
    };

    sock.onclose = () => {
      clearTimeout(timer);
      if (ws !== sock) return;
      const wasReady = state === 'ready';
      ws = null;
      if (handlers) endTurn();
      if (closedByUs) return;
      // Expired or dropped after working: warm a new channel in the background.
      // Never reached ready: the service is down — say so rather than loop.
      if (wasReady) void connect();
      else setState('unavailable');
    };
  };

  void connect();

  return {
    state: () => state,

    startTurn(options, h) {
      // Before any await: this must run inside the press gesture.
      player.unlockAudio();
      player.stopSpeech();
      const sock = ws;
      if (!sock || state !== 'ready' || handlers) {
        h.onError?.('NOT_READY', 'voice is not connected');
        return { stop() {}, cancel() {} };
      }
      handlers = h;
      sock.send(
        JSON.stringify({
          t: 'begin',
          language: options.language,
          explicit: options.explicit === true,
          history: options.history ?? [],
          part: options.part ?? null,
          machine: options.machine ?? options.context?.machine ?? null,
          context: options.context ?? null,
        })
      );

      let stopped = false;
      // The server queues frames that beat the Sarvam handshake, so the mic
      // streams immediately — the first half-second is where the question starts.
      startMic({
        onFrame: (b64, level) => {
          if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: 'audio', b64 }));
          h.onLevel?.(level);
        },
        onError: (code) => h.onError?.(code, 'the microphone was disconnected'),
        onSilent: () => h.onError?.('MIC_SILENT', 'the microphone is sending silence'),
      })
        .then((m) => {
          if (stopped) m.stop();
          else mic = m;
        })
        .catch((e: Error) => {
          h.onError?.('MIC_DENIED', e.message);
          if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: 'cancel' }));
          handlers = null;
          h.onDone?.();
        });

      return {
        stop() {
          if (stopped) return;
          stopped = true;
          stopMic();
          if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: 'stop' }));
        },
        cancel() {
          if (stopped) return;
          stopped = true;
          stopMic();
          player.stopSpeech();
          if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: 'cancel' }));
          if (handlers === h) {
            handlers = null;
            h.onDone?.();
          }
        },
      };
    },

    ask(text, options, h) {
      // Before any await: this must run inside the click gesture.
      player.unlockAudio();
      player.stopSpeech();
      const sock = ws;
      if (!sock || state !== 'ready' || handlers) {
        h.onError?.('NOT_READY', 'voice is not connected');
        return false;
      }
      handlers = h;
      sock.send(
        JSON.stringify({
          t: 'ask',
          text,
          language: options.language,
          history: options.history ?? [],
          part: options.part ?? null,
          machine: options.machine ?? options.context?.machine ?? null,
          context: options.context ?? null,
        })
      );
      return true;
    },

    close() {
      closedByUs = true;
      stopMic();
      player.stopSpeech();
      ws?.close();
      ws = null;
      setState('closed');
    },
  };
}
