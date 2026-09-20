/**
 * End-to-end smoke test for the live voice loop, without a microphone.
 *
 *   set -a && . ./.env && set +a
 *   npm run dev                    # in another terminal
 *   npx tsx scripts/voice-smoke.ts --lang hi-IN
 *
 * Against a deployed service, pass both the socket and an origin the service
 * actually allows — the upgrade handler refuses anything else with a 403
 * before it reads a frame:
 *
 *   npx tsx scripts/voice-smoke.ts --lang hi-IN --url wss://<host>/voice/stream --origin https://<allowed-web-origin>
 *
 * This is the method VOICE.md prescribes: synthesise the question with Sarvam
 * TTS, resample to 16 kHz, and feed it into our own socket in 50 ms frames at
 * wall-clock speed. Playing it at real speed is the point — it is the only way
 * to exercise "audio still arriving while the model is already answering"
 * rather than assert it.
 *
 * It drives the real protocol end to end:
 *   start -> ready -> begin -> listening -> audio xN -> stop
 *        -> partial* -> final -> (Bedrock) -> audio* -> done
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { textToSpeech } from '../src/sarvam/client.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const language = arg('lang', 'hi-IN');
const url = arg('url', 'ws://127.0.0.1:3001/voice/stream');
const question = arg(
  'q',
  language.startsWith('hi')
    ? 'हाइड्रोलिक सिलेंडर लोड के नीचे खिसक रहा है, क्या कारण हो सकता है?'
    : 'Why is my hydraulic cylinder drifting under load?'
);

/* ── a real ID token, from the same script the API demo uses ───────────────── */

console.log('minting a token…');
const token = execFileSync(
  'node',
  [join(REPO, 'web', 'scripts', 'dev-token.mjs'), '--role', 'worker'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
).trim();
if (!token.startsWith('ey')) throw new Error('did not get a JWT from dev-token.mjs');

/* ── synthesise the question, then make it look like a microphone ──────────── */

console.log(`synthesising: ${question}`);
const wav = await textToSpeech(question, { language });
if (!wav) throw new Error('Sarvam TTS returned nothing — is SARVAM_API_KEY set?');

/** Strip the RIFF header: find the `data` chunk and take what follows. */
function pcmFromWav(buf: Buffer): Int16Array {
  const i = buf.indexOf(Buffer.from('data', 'ascii'));
  const start = i === -1 ? 44 : i + 8;
  const bytes = buf.subarray(start);
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
}

/**
 * TTS returns 22050 Hz; `saaras:v3-realtime` wants 16 kHz mono linear16. These
 * are two different rates and conflating them produces audio that transcribes
 * as gibberish rather than failing outright.
 */
function resample(input: Int16Array, from: number, to: number): Int16Array {
  const ratio = from / to;
  const out = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const src = i * ratio;
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, input.length - 1);
    out[i] = input[lo] + (input[hi] - input[lo]) * (src - lo);
  }
  return out;
}

const pcm16k = resample(pcmFromWav(Buffer.from(wav, "base64")), 22050, 16000);
const SAMPLES_PER_FRAME = 16000 * 0.05; // 50 ms
const frames: string[] = [];
for (let i = 0; i < pcm16k.length; i += SAMPLES_PER_FRAME) {
  const slice = pcm16k.subarray(i, i + SAMPLES_PER_FRAME);
  frames.push(Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength).toString('base64'));
}
console.log(`  ${frames.length} frames (${(frames.length * 0.05).toFixed(1)}s of audio)`);

/* ── drive the channel ─────────────────────────────────────────────────────── */

// The upgrade handler checks Origin before it reads a frame, and the loopback
// exemption is hard-gated on NODE_ENV — so against a deployed service this has
// to present an origin that is actually in ALLOWED_ORIGINS, or the socket is
// refused with 403 and the run never starts.
const ws = new WebSocket(url, { origin: arg('origin', 'http://localhost:3123') });
const send = (o: unknown) => ws.send(JSON.stringify(o));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let audioFrames = 0;
let firstAudioAt = 0;
let replyText = '';
let startedAt = 0;
let grounded: boolean | undefined;
let engines: Record<string, string> | undefined;
let spokenLanguage: string | null = null;
/** Sentences from the clip fallback, held by `i` — they do not arrive in order. */
const clips = new Map<number, string>();

const finished = new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('no `done` within 60s')), 60_000);

  ws.on('open', async () => {
    console.log('\nconnected; authenticating from the first frame');
    send({ t: 'start', token });
  });

  ws.on('message', async (raw: Buffer) => {
    const msg = JSON.parse(raw.toString());
    switch (msg.t) {
      case 'ready':
        console.log('  ready — channel authenticated');
        send({ t: 'begin', language });
        break;

      case 'listening': {
        console.log('  listening — streaming at wall-clock speed');
        startedAt = Date.now();
        for (const b64 of frames) {
          send({ t: 'audio', b64 });
          await sleep(50);
        }
        send({ t: 'stop' });
        console.log(`  stop sent after ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        break;
      }

      case 'partial':
        process.stdout.write(`  partial: ${String(msg.text).slice(0, 70)}\r`);
        break;

      case 'final':
        console.log(`\n  FINAL TRANSCRIPT [${msg.language}]: ${msg.text}`);
        break;

      case 'thinking':
        console.log('  thinking — transcript settled, model called');
        break;

      // The streamed reply. Not `text` — that message does not exist.
      case 'delta':
        replyText += msg.text ?? '';
        break;

      // The clip fallback path, which carries whole sentences instead of
      // deltas. A turn can switch to it mid-reply, so both must be handled or
      // the reply reads as empty on a perfectly good answer.
      case 'say':
        clips.set(Number(msg.i), String(msg.text ?? ''));
        if (msg.audio) audioFrames += 1;
        break;

      case 'audio_start':
        console.log(`  audio_start — ${msg.rate}Hz ${msg.encoding}`);
        break;

      case 'audio':
        audioFrames += 1;
        if (!firstAudioAt) {
          firstAudioAt = Date.now();
          console.log(`  first audio out at +${((firstAudioAt - startedAt) / 1000).toFixed(1)}s`);
        }
        break;

      case 'audio_end':
        console.log('  audio_end');
        break;

      // The turn's own summary, and the authoritative reply text.
      case 'reply':
        replyText = String(msg.text ?? replyText);
        spokenLanguage = (msg.language as string | null) ?? null;
        grounded = msg.grounded as boolean | undefined;
        engines = msg.engines as Record<string, string> | undefined;
        break;

      case 'empty':
        console.log('  empty — the transcript had no letters, so no model call');
        break;

      case 'error':
        console.error(`  ERROR [${msg.code}] ${msg.message}`);
        break;

      case 'expired':
        console.error('  token expired mid-channel');
        break;

      case 'done':
        clearTimeout(timer);
        resolve();
        break;
    }
  });

  ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  ws.on('close', (code) => console.log(`  socket closed (${code})`));
});

await finished;

// Clips arrive out of order and only the streaming path fills `replyText`.
if (!replyText && clips.size) {
  replyText = [...clips.entries()].sort(([a], [b]) => a - b).map(([, s]) => s).join(' ');
}

console.log('\n─── result ───');
console.log(`reply text   : ${replyText.slice(0, 400) || '(none)'}`);
console.log(`spoken in    : ${spokenLanguage ?? '(not reported)'}`);
console.log(`grounded     : ${grounded === undefined ? '(not reported)' : grounded}`);
if (engines) for (const [k, v] of Object.entries(engines)) console.log(`  ${k.padEnd(10)} ${v}`);
console.log(`audio frames : ${audioFrames}${clips.size ? ` (clip path, ${clips.size} sentences)` : ''}`);
console.log(`total        : ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
ws.close();
process.exit(0);
