/**
 * The voice path end to end, with Sarvam and Bedrock replaced at the network /
 * function boundary and everything under src/ running unmodified.
 *
 * Audio is fed at WALL-CLOCK speed in 50ms frames, exactly as a microphone does,
 * so "words appear while still speaking" is exercised rather than asserted.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket, { WebSocketServer } from 'ws';

/* ── stub Sarvam ─────────────────────────────────────────────────────────── */

interface SttScript {
  /** [frameIndex, partialText] — emitted once that many frames have arrived. */
  partials: [number, string][];
  final: string;
  language: string;
}
let sttScript: SttScript;
let sttFramesReceived = 0;
let sttHandshakeDelayMs = 0;
const ttsTexts: string[] = [];
let ttsConfig: Record<string, unknown> | null = null;

const vendor = createServer();
const sttWss = new WebSocketServer({ noServer: true });
const ttsWss = new WebSocketServer({ noServer: true });

vendor.on('upgrade', async (req, socket, head) => {
  const path = new URL(req.url ?? '', 'http://x').pathname;
  if (path === '/stt') {
    if (sttHandshakeDelayMs) await sleep(sttHandshakeDelayMs);
    sttWss.handleUpgrade(req, socket, head, (ws) => {
      let frames = 0;
      let next = 0;
      ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.event === 'audio_input') {
          frames++;
          sttFramesReceived++;
          while (next < sttScript.partials.length && sttScript.partials[next]![0] <= frames) {
            ws.send(JSON.stringify({ event: 'transcript.partial', text: sttScript.partials[next]![1], language: 'en-IN' }));
            next++;
          }
        } else if (m.event === 'flush') {
          setTimeout(
            () => ws.send(JSON.stringify({ event: 'transcript.final', text: sttScript.final, language: sttScript.language })),
            30
          );
        }
      });
    });
  } else if (path === '/tts') {
    ttsWss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'config') ttsConfig = m.data;
        if (m.type === 'text') {
          ttsTexts.push(m.data.text);
          // Sarvam's real rule: a message with no letter kills the stream.
          if (!/[\p{L}\p{M}]/u.test(m.data.text)) {
            ws.send(JSON.stringify({ type: 'error', data: { message: "'text' cannot be empty" } }));
            return ws.close();
          }
          ws.send(JSON.stringify({ type: 'audio', data: { audio: Buffer.alloc(441).toString('base64') } }));
        }
        if (m.type === 'flush') setTimeout(() => ws.send(JSON.stringify({ type: 'event', data: { event_type: 'final' } })), 20);
      });
    });
  } else socket.destroy();
});

/* ── stub model + KB ──────────────────────────────────────────────────────── */

interface ModelCall {
  system: string;
  messages: { role: string; content: string }[];
  at?: number;
}
const modelCalls: ModelCall[] = [];
let modelReply: (call: ModelCall) => string[] = () => [];

async function* fakeStream(req: ModelCall, signal?: AbortSignal) {
  modelCalls.push({ ...req, at: Date.now() });
  await sleep(40);
  for (const tok of modelReply(req)) {
    if (signal?.aborted) return;
    await sleep(3);
    yield tok;
  }
}

const groundedOrgs: string[] = [];
const fakeGrounder = (orgId: string) => async (q: string) => {
  groundedOrgs.push(orgId);
  return q ? 'SOP-7: Release hydraulic pressure to 0 bar before opening the pump.' : null;
};

/* ── the service under test ───────────────────────────────────────────────── */

let service: Server;
let port = 0;
type Frame = Record<string, unknown> & { t: string };

before(async () => {
  await new Promise<void>((r) => vendor.listen(0, '127.0.0.1', r));
  const vp = (vendor.address() as AddressInfo).port;
  Object.assign(process.env, {
    NODE_ENV: 'development',
    SARVAM_API_KEY: 'test-key',
    COGNITO_USER_POOL_ID: 'ap-northeast-1_testpool',
    COGNITO_CLIENT_ID: 'testclient',
    APP_TABLE_NAME: 'test-table',
    ALLOWED_ORIGINS: 'https://app.example',
    SARVAM_REALTIME_URL: `ws://127.0.0.1:${vp}/stt`,
    SARVAM_TTS_WS_URL: `ws://127.0.0.1:${vp}/tts`,
    SARVAM_FINAL_TIMEOUT_MS: '1500',
  });
  const { attach } = await import('../src/voice/channel.js');
  const { VoiceAuthError } = await import('../src/auth/cognito.js');
  service = createServer();
  attach(service, {
    streamText: fakeStream as never,
    grounder: fakeGrounder,
    verify: async (token) => {
      if (!token.startsWith('good:')) throw new VoiceAuthError('session expired — sign in again');
      return { userId: token.slice(5), orgId: 'org-acme', role: 'worker', expiresAt: Date.now() + 3600_000 };
    },
  });
  await new Promise<void>((r) => service.listen(0, '127.0.0.1', r));
  port = (service.address() as AddressInfo).port;
});

after(() => {
  service.close();
  vendor.close();
  setTimeout(() => process.exit(0), 50).unref();
});

function connect(origin = 'https://app.example') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/voice/stream`, { origin });
  const frames: (Frame & { at: number })[] = [];
  const waiters: [(f: Frame) => boolean, (f: Frame) => void][] = [];
  ws.on('message', (raw) => {
    const f = { ...(JSON.parse(raw.toString()) as Frame), at: Date.now() };
    frames.push(f);
    for (const w of [...waiters]) if (w[0](f)) { waiters.splice(waiters.indexOf(w), 1); w[1](f); }
  });
  const waitFor = (pred: (f: Frame) => boolean, ms = 8000) =>
    new Promise<Frame>((resolve, reject) => {
      const hit = frames.find(pred);
      if (hit) return resolve(hit);
      const timer = setTimeout(() => reject(new Error(`timed out; saw ${frames.map((f) => f.t).join(',')}`)), ms);
      waiters.push([pred, (f) => { clearTimeout(timer); resolve(f); }]);
    });
  const opened = new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.once('error', reject);
  });
  return { ws, frames, waitFor, opened, send: (o: unknown) => ws.send(JSON.stringify(o)) };
}

const pcmFrame = () => Buffer.alloc(1600).toString('base64'); // 800 samples = 50ms @16k

async function speak(c: ReturnType<typeof connect>, nFrames: number) {
  for (let i = 0; i < nFrames; i++) {
    c.send({ t: 'audio', b64: pcmFrame() });
    await sleep(50);
  }
}

function reset() {
  modelCalls.length = 0;
  ttsTexts.length = 0;
  ttsConfig = null;
  sttFramesReceived = 0;
  sttHandshakeDelayMs = 0;
}

const HINDI_REPLY = [
  'Hydraulic', ' pump', ' खोलने', ' से', ' पहले', ' pressure', ' ',
  '0', ' bar', ' करें', '।', ' ', 'फिर', ' valve', ' बंद', ' करें', ',', ' ', 'और', ' LOTO', ' tag', ' लगाएँ', '।', '\n\n',
];

/* ── tests ────────────────────────────────────────────────────────────────── */

test('a full turn: words while speaking, grounded Hindi answer, ordered audio', async () => {
  reset();
  sttScript = {
    partials: [
      [4, 'pump'],
      [8, 'pump kholne se'],
      [9, 'pump'], // replay burst — must not reset anything
      [12, 'pump kholne se pehle kya'],
      [16, 'pump kholne se pehle kya karna hai'],
      [18, 'pump kholne se pehle kya karna hai'], // silence re-send
    ],
    final: 'पंप खोलने से पहले क्या करना है',
    language: 'hi-IN',
  };
  modelReply = () => HINDI_REPLY;

  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-1' });
  await c.waitFor((f) => f.t === 'ready');

  // A client-supplied orgId must be ignored — tenant comes from the token only.
  c.send({ t: 'begin', language: 'hi-IN', history: [], orgId: 'org-evil', part: 'Hydraulic pump' });
  await c.waitFor((f) => f.t === 'listening');
  const tStart = Date.now();
  await speak(c, 26);
  const tRelease = Date.now();
  c.send({ t: 'stop' });

  const reply = await c.waitFor((f) => f.t === 'reply');
  await c.waitFor((f) => f.t === 'done');

  // Words appeared WHILE speaking, long before release.
  const firstPartial = c.frames.find((f) => f.t === 'partial')!;
  assert.ok(firstPartial.at < tRelease - 500, `first partial ${firstPartial.at - tStart}ms in, release at ${tRelease - tStart}ms`);

  // Grounding used the verified org and reached the prompt.
  assert.ok(groundedOrgs.every((o) => o === 'org-acme'));
  const answered = modelCalls[modelCalls.length - 1]!;
  assert.match(answered.system, /SOP-7/);
  assert.match(answered.messages.at(-1)!.content, /Hydraulic pump/);

  // Speculation started while the button was still held, and was adopted:
  // exactly one model call for the whole turn.
  assert.equal(modelCalls.length, 1, `model calls: ${modelCalls.length}`);
  assert.ok(modelCalls[0]!.at! < tRelease, 'model should start before release');

  // Sarvam never saw a letterless message, and the voice was configured Hindi.
  assert.ok(ttsTexts.length > 0);
  for (const t of ttsTexts) assert.match(t, /[\p{L}\p{M}]/u, `unspeakable message sent: ${JSON.stringify(t)}`);
  assert.equal(ttsTexts.join(''), HINDI_REPLY.join('').replace(/\s*\n+\s*/g, ' '));
  assert.equal(ttsConfig?.language_code, 'hi-IN');

  // Audio in strictly increasing seq, bracketed by start/end.
  const audio = c.frames.filter((f) => f.t === 'audio');
  assert.ok(audio.length > 0);
  audio.forEach((f, i) => assert.equal(f.seq, i));
  assert.equal(c.frames.find((f) => f.t === 'audio_start')?.rate, 22050);
  assert.ok(c.frames.some((f) => f.t === 'audio_end'));

  assert.equal(reply.heard_language, 'hi-IN');
  assert.equal(reply.grounded, true);
  assert.equal(c.frames.filter((f) => f.t === 'error').length, 0);

  // The channel outlives the turn.
  c.send({ t: 'begin', language: 'hi-IN', history: [] });
  await c.waitFor((f) => f.t === 'listening' && f.at > (reply as { at: number }).at);
  c.ws.close();
});

test('silence is not a question: no model call, no speech', async () => {
  reset();
  sttScript = { partials: [], final: '" "', language: 'kn-IN' };
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-2' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'begin', language: 'hi-IN', history: [] });
  await speak(c, 10);
  c.send({ t: 'stop' });
  await c.waitFor((f) => f.t === 'empty');
  await c.waitFor((f) => f.t === 'done');
  assert.equal(modelCalls.length, 0);
  assert.equal(ttsTexts.length, 0);
  c.ws.close();
});

test('audio sent before the Sarvam handshake completes is queued, not dropped', async () => {
  reset();
  sttHandshakeDelayMs = 400;
  sttScript = { partials: [[1, 'valve kab band karein']], final: 'valve kab band karein', language: 'en-IN' };
  modelReply = () => ['Close', ' the', ' valve', ' only', ' after', ' the', ' pressure', ' reads', ' zero', '.'];
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-3' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'begin', language: 'en-IN', history: [] });
  await speak(c, 14);
  c.send({ t: 'stop' });
  await c.waitFor((f) => f.t === 'done');
  assert.equal(sttFramesReceived, 14);
  c.ws.close();
});

test('a wrong-script answer is restarted exactly once, never looped', async () => {
  reset();
  // Romanised Hindi partial, same length as the final: adopted without a
  // restart, so the SCRIPT CHECK is what must catch the wrong answer.
  sttScript = {
    partials: [[2, 'pump ka pressure kitna hona chahiye']],
    final: 'पंप का pressure कितना होना चाहिए',
    language: 'hi-IN',
  };
  // Always Latin-script Hinglish — wrong for hi-IN every time.
  modelReply = () => 'Pump ka pressure zero hona chahiye before you open it safely today .'.split(/(?= )/);
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-4' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'begin', language: 'hi-IN', history: [] });
  await speak(c, 6);
  c.send({ t: 'stop' });
  await c.waitFor((f) => f.t === 'done');
  // One start (speculative or at release), one restart told Hindi — and no third.
  assert.equal(modelCalls.length, 2, `model calls: ${modelCalls.length}`);
  assert.doesNotMatch(modelCalls[0]!.system, /speaking Hindi/);
  assert.match(modelCalls[1]!.system, /speaking Hindi/);
  // The rejected first answer never reached the screen.
  const shown = c.frames.filter((f) => f.t === 'delta').map((f) => f.text).join('');
  assert.equal(shown, modelReply(modelCalls[1]!).join(''));
  c.ws.close();
});

test('upgrade guards: foreign origin refused before any frame', async () => {
  const c = connect('https://evil.example');
  await assert.rejects(c.opened, /HTTP 403/);
});

test('auth: bad token rejected; fourth socket per user refused', async () => {
  const bad = connect();
  await bad.opened;
  bad.send({ t: 'start', token: 'forged' });
  const err = await bad.waitFor((f) => f.t === 'error');
  assert.equal(err.code, 'UNAUTHORIZED');

  const socks = [connect(), connect(), connect(), connect()];
  for (const s of socks) await s.opened;
  for (const s of socks.slice(0, 3)) {
    s.send({ t: 'start', token: 'good:worker-5' });
    await s.waitFor((f) => f.t === 'ready');
  }
  socks[3]!.send({ t: 'start', token: 'good:worker-5' });
  const busy = await socks[3]!.waitFor((f) => f.t === 'error');
  assert.equal(busy.code, 'BUSY');
  socks.forEach((s) => s.ws.close());
});

test('frames before start are ignored', async () => {
  reset();
  const c = connect();
  await c.opened;
  c.send({ t: 'begin', language: 'hi-IN', history: [] });
  await sleep(150);
  assert.equal(c.frames.length, 0);
  c.ws.close();
});
