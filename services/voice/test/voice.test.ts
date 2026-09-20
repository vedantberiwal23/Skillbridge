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
let sttConnections = 0;
const ttsTexts: string[] = [];
let ttsConfig: Record<string, unknown> | null = null;

const vendor = createServer();
const sttWss = new WebSocketServer({ noServer: true });
const ttsWss = new WebSocketServer({ noServer: true });

vendor.on('upgrade', async (req, socket, head) => {
  const path = new URL(req.url ?? '', 'http://x').pathname;
  if (path === '/stt') {
    if (sttHandshakeDelayMs) await sleep(sttHandshakeDelayMs);
    sttConnections++;
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

/* ── captured persistence (see the attach() call below) ───────────────────── */

type TurnRecord = import('../src/lib/telemetry.js').TurnRecord;
type SessionRecord = import('../src/lib/telemetry.js').SessionRecord;
const recordedTurns: TurnRecord[] = [];
const recordedSessions: SessionRecord[] = [];

before(async () => {
  await new Promise<void>((r) => vendor.listen(0, '127.0.0.1', r));
  const vp = (vendor.address() as AddressInfo).port;
  Object.assign(process.env, {
    NODE_ENV: 'development',
    // The keepalive, sped up so the test below does not wait 25s for it.
    VOICE_PING_MS: '250',
    SARVAM_API_KEY: 'test-key',
    COGNITO_USER_POOL_ID: 'ap-northeast-1_testpool',
    COGNITO_CLIENT_ID: 'testclient',
    APP_TABLE_NAME: 'test-table',
    ALLOWED_ORIGINS: 'https://app.example',
    SARVAM_REALTIME_URL: `ws://127.0.0.1:${vp}/stt`,
    SARVAM_TTS_WS_URL: `ws://127.0.0.1:${vp}/tts`,
    SARVAM_FINAL_TIMEOUT_MS: '1500',
    /**
     * Pinned, not inherited. Speculation is a WALL-CLOCK behaviour, so any test
     * that exercises it is really asserting a relationship between three
     * durations: the gap between consecutive partials, the silent tail before
     * release, and this window. Inheriting the production 250ms left that
     * relationship to chance.
     *
     * `speak()` sends one frame per `await sleep(50)`, and a sleep always
     * overshoots — four of them measure ~237ms idle on this machine, against a
     * 250ms window. A 13ms margin, which any load erases; the partial before
     * last then speculates, the next partial invalidates it, and the turn spends
     * two model calls instead of one.
     *
     * 400ms puts the window clear of both bounds. See the full-turn test for the
     * arithmetic. Frame timings only ever stretch, never compress, so the tail
     * side of the inequality cannot break — only the gap side, and that now
     * needs a ~69% overshoot rather than 5%.
     */
    VOICE_SPEC_STABLE_MS: '400',
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
    // Captured rather than written. Without these the suite would issue real
    // PutItems against 'test-table'; they are swallowed by design, so the only
    // symptom would be slow tests and warnings in the output.
    recordTurn: (t) => void recordedTurns.push(t),
    recordSession: (s) => void recordedSessions.push(s),
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
  recordedTurns.length = 0;
  recordedSessions.length = 0;
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
  /**
   * 30 frames, ~50ms each. The count is load-bearing, not arbitrary — it sets
   * the silent tail after the last NEW partial, which is what must trigger a
   * speculation. Against VOICE_SPEC_STABLE_MS=400 (set in `before`):
   *
   *   longest gap between new partials   4 frames, ~237ms   <- must stay UNDER
   *   silent tail, frame 16 -> release  14 frames, ~831ms   <- must stay OVER
   *
   * Frame 9 and frame 18 are character-prefix replays, so they are ignored and
   * do NOT restart the timer — which is why the tail is measured from 16, not
   * 18. Shortening this speak() narrows the tail and reintroduces the flake.
   */
  await speak(c, 30);
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

  /**
   * Speculation started while the button was still held, and was adopted.
   *
   * These two assertions are the whole point of the test and they only mean
   * something together: the second says the generation began BEFORE release, so
   * it was speculative rather than started at the button-up; the first says no
   * other generation was needed, so that speculation was adopted rather than
   * thrown away and redone.
   *
   * `modelCalls` records every start, aborted ones included, so a restart shows
   * up here as an extra entry. Do not relax this to `<= 2` — an abandoned
   * speculation plus a fresh start at release is exactly the wasted-tokens
   * regression this guards, and it would then pass silently. Restart behaviour
   * has its own test ('a wrong-script answer is restarted exactly once').
   */
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

/* ── persistence ──────────────────────────────────────────────────────────── */

test('an answered turn is recorded against the VERIFIED org, off the turn path', async () => {
  reset();
  sttScript = { partials: [[2, 'pump']], final: 'pump kaise kholen', language: 'hi-IN' };
  modelReply = () => HINDI_REPLY;
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-rec' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'begin', language: 'hi-IN', history: [], part: 'rod-seal' });
  await speak(c, 6);
  c.send({ t: 'stop' });
  await c.waitFor((f) => f.t === 'done');

  assert.equal(recordedTurns.length, 1);
  const turn = recordedTurns[0]!;
  // Identity comes from the token the channel verified, never from a frame.
  assert.equal(turn.userId, 'worker-rec');
  assert.equal(turn.orgId, 'org-acme');
  assert.equal(turn.question, 'pump kaise kholen');
  assert.equal(turn.part, 'rod-seal');
  assert.ok(turn.grounded, 'the fake grounder answered, so the turn is grounded');
  assert.ok(turn.replyChars > 0);
  // Raw audio is never carried off the turn.
  assert.ok(!Object.keys(turn).some((k) => /audio|pcm|b64/i.test(k)));

  c.ws.close();
  await sleep(50);
  assert.equal(recordedSessions.length, 1);
  const session = recordedSessions[0]!;
  assert.equal(session.userId, 'worker-rec');
  assert.equal(session.orgId, 'org-acme');
  assert.equal(session.turns, 1);
  assert.equal(session.answered, 1);
  assert.equal(session.sessionId, turn.sessionId, 'the turn files under its own channel');
});

test('a silent turn is counted but not recorded as a question', async () => {
  reset();
  sttScript = { partials: [], final: '" "', language: 'hi-IN' };
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-silent' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'begin', language: 'hi-IN', history: [] });
  await speak(c, 4);
  c.send({ t: 'stop' });
  await c.waitFor((f) => f.t === 'done');

  // Nothing was asked, so the profiler gets no blank line in its digest…
  assert.equal(recordedTurns.length, 0);
  c.ws.close();
  await sleep(50);
  // …but the session still shows a worker who pressed the button and got nothing,
  // which is exactly the signal a mic problem leaves behind.
  assert.equal(recordedSessions[0]!.turns, 1);
  assert.equal(recordedSessions[0]!.answered, 0);
});

test('a channel that never authenticates leaves nothing behind', async () => {
  reset();
  const c = connect();
  await c.opened;
  c.ws.close();
  await sleep(50);
  assert.equal(recordedSessions.length, 0);
  assert.equal(recordedTurns.length, 0);
});

test('the EVT# item satisfies the fanout and profiler contracts', async () => {
  const { eventItem, sessionItem } = await import('../src/lib/telemetry.js');
  const base = {
    userId: 'u1', orgId: 'org-acme', sessionId: 's1',
    question: 'pump kaise kholen', heardLanguage: 'hi-IN', spokenLanguage: 'hi-IN',
    grounded: true, part: null, replyChars: 42, latencyMs: 900,
  };
  const item = eventItem(base, '2026-09-19T10:00:00.000Z', 'abc');

  // collectJobs() skips any record failing one of these, silently.
  assert.equal(item.PK, 'USER#u1');
  assert.ok(item.SK.startsWith('EVT#'), 'the fanout filters on this prefix');
  assert.equal(item.orgId, 'org-acme');

  // The sort key's timestamp must survive the round trip the fanout does, and
  // must order lexicographically — the profiler's only read is a range query.
  assert.equal(item.SK, 'EVT#2026-09-19T10:00:00.000Z#abc');
  const older = eventItem(base, '2026-09-19T09:59:59.999Z', 'zzz');
  assert.ok(older.SK < item.SK, 'ISO-8601 UTC sorts lexicographically');

  // The TTL trap: named exactly `ttl`, and in SECONDS. The table ignores any
  // other name silently, and a milliseconds value would expire in ~50,000 years.
  assert.equal(typeof item.ttl, 'number');
  const days = (item.ttl - Date.now() / 1000) / 86400;
  assert.ok(days > 89 && days < 91, `expected ~90 days, got ${days.toFixed(1)}`);
  assert.ok(!('TTL' in item) && !('expiresAt' in item));

  // The profiler joins [question, assessmentId, lessonId, transcript]; setting
  // both `question` and `transcript` would enter the same string twice.
  assert.equal(item.type, 'VOICE_QUERY');
  assert.equal(item.question, 'pump kaise kholen');
  assert.ok(!('transcript' in item));

  // A session is a durable record, not profiler input: no TTL, and the sort key
  // orders by when it STARTED.
  const s = sessionItem({
    userId: 'u1', orgId: 'org-acme', sessionId: 's1',
    startedAt: '2026-09-19T09:00:00.000Z', turns: 2, answered: 1, languages: ['hi-IN'],
  });
  assert.equal(s.SK, 'SESSION#2026-09-19T09:00:00.000Z#s1');
  assert.ok(!('ttl' in s), 'the 90-day sweep is for EVT# items only');
  assert.equal(s.orgId, 'org-acme');
});

test('a typed question gets the real answer: no recogniser, same model, voice and grounding', async () => {
  reset();
  const sttBefore = sttConnections;
  modelReply = () => HINDI_REPLY;
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-typed' });
  await c.waitFor((f) => f.t === 'ready');

  // A client-supplied orgId is ignored here too.
  c.send({ t: 'ask', text: 'pump kholne se pehle kya karein?', language: 'hi-IN', part: 'Relief valve', history: [], orgId: 'org-evil' });
  const reply = await c.waitFor((f) => f.t === 'reply');
  await c.waitFor((f) => f.t === 'done');

  assert.equal(sttConnections, sttBefore, 'a typed turn must not open a recognition socket');
  assert.equal(modelCalls.length, 1);
  // Verbatim, with the tapped part as context, and told the app's language.
  assert.match(modelCalls[0]!.messages.at(-1)!.content, /pump kholne se pehle kya karein\?/);
  assert.match(modelCalls[0]!.messages.at(-1)!.content, /Relief valve/);
  assert.match(modelCalls[0]!.system, /speaking Hindi/);
  assert.match(modelCalls[0]!.system, /SOP-7/);
  assert.equal(reply.transcript, 'pump kholne se pehle kya karein?');
  assert.equal(reply.grounded, true);
  assert.ok(c.frames.some((f) => f.t === 'audio'), 'typed answers are spoken too');
  for (const t of ttsTexts) assert.match(t, /[\p{L}\p{M}]/u);
  assert.equal(recordedTurns.length, 1);
  assert.equal(recordedTurns[0]!.orgId, 'org-acme');

  // The channel is reusable after a typed turn.
  c.send({ t: 'begin', language: 'hi-IN', history: [] });
  await c.waitFor((f) => f.t === 'listening');
  c.send({ t: 'cancel' });
  c.ws.close();
});

test('a typed question with no letters is not answered', async () => {
  reset();
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-typed-2' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'ask', text: '  ?? ', language: 'en-IN' });
  await c.waitFor((f) => f.t === 'empty');
  await c.waitFor((f) => f.t === 'done');
  assert.equal(modelCalls.length, 0);
  c.ws.close();
});

test('the machine on screen is the subject: a typed question carries it', async () => {
  reset();
  modelReply = () => ['यह ', 'एक ', 'air ', 'compressor ', 'है।'];
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-machine' });
  await c.waitFor((f) => f.t === 'ready');

  // A worker who just uploaded a machine and asks the bare question.
  c.send({ t: 'ask', text: 'what is this?', language: 'en-IN', machine: 'Air compressor, bay 2' });
  await c.waitFor((f) => f.t === 'done');

  const asked = modelCalls.at(-1)!.messages.at(-1)!.content;
  assert.match(asked, /Machine on screen: Air compressor, bay 2/);
  assert.match(asked, /what is this\?/);
  // No part was tapped, so nothing claims one was.
  assert.doesNotMatch(asked, /Part the worker tapped/);
  c.ws.close();
});

test('machine and part are both named, and neither is invented', async () => {
  reset();
  modelReply = () => HINDI_REPLY;
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-both' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'ask', text: 'yeh kaise kholte hain?', language: 'hi-IN', machine: 'HPU-400', part: 'Relief valve' });
  await c.waitFor((f) => f.t === 'done');
  const asked = modelCalls.at(-1)!.messages.at(-1)!.content;
  assert.match(asked, /Machine on screen: HPU-400\. Part the worker tapped: Relief valve/);

  // And with neither, the question stands alone — no phantom subject.
  modelCalls.length = 0;
  c.send({ t: 'ask', text: 'general question', language: 'en-IN' });
  // The second `done` of this channel, not the first one again.
  await c.waitFor(() => c.frames.filter((f) => f.t === 'done').length === 2);
  assert.equal(modelCalls.at(-1)!.messages.at(-1)!.content, 'general question');
  c.ws.close();
});

test('the server keeps an idle socket warm, without extending the session', async () => {
  reset();
  const c = connect();
  const pings: number[] = [];
  c.ws.on('ping', () => pings.push(Date.now()));
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-idle' });
  await c.waitFor((f) => f.t === 'ready');

  // Sit completely idle. An Application Load Balancer drops a connection with
  // no traffic for 60s, so the server has to generate some by itself.
  await sleep(900);
  assert.ok(pings.length >= 2, `expected keepalive pings, saw ${pings.length}`);
  assert.equal(c.ws.readyState, WebSocket.OPEN);

  // The keepalive must not read as activity: `expired` is the only thing
  // stopping a revoked user holding an authorized socket, so a silent channel
  // still has to expire on schedule. Proven here by the absence of any bump:
  // pings flowed, and the channel never reported itself renewed.
  assert.equal(c.frames.filter((f) => f.t === 'expired').length, 0);
  c.ws.close();
});

test('a language we understand but cannot speak is written, not spoken', async () => {
  reset();
  // Assamese: saaras:v3 transcribes it, bulbul:v3 has no voice for it.
  modelReply = () => ['এয়া ', 'এটা ', 'পাম্প।'];
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-as' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'ask', text: 'ই কি?', language: 'as-IN', explicit: true });
  const reply = await c.waitFor((f) => f.t === 'reply');
  await c.waitFor((f) => f.t === 'done');

  // Told to answer in Assamese, and the answer reached the worker as text.
  assert.match(modelCalls.at(-1)!.system, /speaking Assamese/);
  assert.ok(String(reply.text).length > 0);
  // Assamese uses Bengali script, so the Bengali voice can read it.
  assert.equal(reply.spoken, true);
  assert.equal(reply.language, 'bn-IN');
  assert.equal(ttsConfig?.language_code, 'bn-IN');
  c.ws.close();
});

test('a script no voice can read is shown and never spoken in the wrong voice', async () => {
  reset();
  // Urdu is Perso-Arabic: no bulbul voice shares that script.
  modelReply = () => ['یہ ', 'ایک ', 'پمپ ', 'ہے۔'];
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-ur' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'ask', text: 'yeh kya hai?', language: 'ur-IN', explicit: true });
  const reply = await c.waitFor((f) => f.t === 'reply');
  await c.waitFor((f) => f.t === 'done');

  assert.match(modelCalls.at(-1)!.system, /speaking Urdu/);
  assert.ok(String(reply.text).length > 0, 'the answer still reaches the worker');
  assert.equal(reply.spoken, false, 'and it says plainly that it was not spoken');
  assert.equal(ttsTexts.length, 0, 'nothing was sent to a voice that cannot read it');
  assert.equal(c.frames.filter((f) => f.t === 'audio').length, 0);
  c.ws.close();
});

test('a language Sarvam does not know at all still falls back to Hindi', async () => {
  reset();
  modelReply = () => HINDI_REPLY;
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-xx' });
  await c.waitFor((f) => f.t === 'ready');
  c.send({ t: 'ask', text: 'kuch bhi', language: 'xx-YY', explicit: true });
  await c.waitFor((f) => f.t === 'done');
  assert.match(modelCalls.at(-1)!.system, /speaking Hindi/);
  c.ws.close();
});

test('Odia detected as or-IN is answered in Odia, not Hindi', async () => {
  reset();
  // saaras:v3-realtime spells Odia `or-IN`; bulbul:v3 and every list here use
  // `od-IN`. Untranslated, this turn would fall back to the picker's language.
  sttScript = { partials: [[2, 'ଏହା କ’ଣ']], final: 'ଏହା କ’ଣ ଅଟେ', language: 'or-IN' };
  modelReply = () => ['ଏହା ', 'ଏକ ', 'pump ', 'ଅଟେ।'];
  const c = connect();
  await c.opened;
  c.send({ t: 'start', token: 'good:worker-odia' });
  await c.waitFor((f) => f.t === 'ready');
  // The interface is in Hindi — only detection knows the worker spoke Odia.
  c.send({ t: 'begin', language: 'hi-IN', history: [] });
  await speak(c, 6);
  c.send({ t: 'stop' });
  const reply = await c.waitFor((f) => f.t === 'reply');
  await c.waitFor((f) => f.t === 'done');

  assert.equal(reply.heard_language, 'od-IN', 'or-IN must normalise to od-IN');
  assert.match(modelCalls.at(-1)!.system, /speaking Odia/);
  assert.equal(ttsConfig?.language_code, 'od-IN', 'and the Odia voice reads it');
  assert.equal(reply.spoken, true);
  c.ws.close();
});
