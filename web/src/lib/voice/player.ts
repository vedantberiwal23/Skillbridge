/**
 * Playback for a reply that arrives in pieces — Web Audio, not <audio>.
 *
 *   STREAMED (normal)  raw PCM16 chunks tagged with `seq`. Buffered and played
 *                      STRICTLY in seq order, never on arrival, each scheduled to
 *                      start exactly where the previous ends: no gaps, no clicks.
 *   CLIPS (fallback)   one WAV per sentence tagged with `i`, synthesised
 *                      concurrently and so finishing OUT of order. Held by index
 *                      and played in sequence, waiting at a gap, never skipping.
 *
 * Module-scope on purpose: one speaker, one player. Browser-only.
 */

let ctx: AudioContext | null = null;
let nextTime = 0;
/** Bumps on stop, so late decodes and late chunks land nowhere. */
let generation = 0;
const active = new Set<AudioBufferSourceNode>();
const listeners = new Set<(speaking: boolean) => void>();

let streamRate = 22050;
let nextSeq = 0;
const early = new Map<number, string>();

let clips: (string | null | undefined)[] = [];
let cursor = 0;
let clipChain: Promise<void> = Promise.resolve();

function notify() {
  const on = active.size > 0;
  listeners.forEach((fn) => fn(on));
}

function context(): AudioContext {
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
  }
  // Not just 'suspended': iOS Safari also enters 'interrupted' when the audio
  // session changes — which releasing the mic does. Replies were silent on
  // iPhones when only 'suspended' was resumed.
  if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => undefined);
  return ctx;
}

/**
 * Call SYNCHRONOUSLY inside the press handler. Mobile browsers refuse audio not
 * traceable to a gesture, and the answer arrives long after the gesture is spent.
 */
export function unlockAudio(): void {
  try {
    context();
  } catch {
    /* no Web Audio */
  }
}

function schedule(buffer: AudioBuffer) {
  const c = context();
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  // A hair of lead so the first chunk does not start in the past and click.
  const start = Math.max(nextTime, c.currentTime + 0.03);
  src.start(start);
  nextTime = start + buffer.duration;
  active.add(src);
  src.onended = () => {
    active.delete(src);
    notify();
  };
  notify();
}

function pcmBuffer(b64: string, rate: number): AudioBuffer {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const buf = context().createBuffer(1, Math.max(1, n), rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    ch[i] = v / 0x8000;
  }
  return buf;
}

export function stopSpeech(): void {
  generation++;
  for (const src of active) {
    try {
      src.stop();
    } catch {
      /* already ended */
    }
  }
  active.clear();
  nextTime = 0;
  nextSeq = 0;
  early.clear();
  clips = [];
  cursor = 0;
  clipChain = Promise.resolve();
  notify();
}

/* ── streamed ─────────────────────────────────────────────────────────────── */

/** On `audio_start { rate }`. A fresh reply starts now, not after the last one. */
export function beginStream(rate: number): void {
  streamRate = rate || 22050;
  nextSeq = 0;
  early.clear();
  if (ctx) nextTime = 0;
}

/** On `audio { seq, b64 }`. Plays in seq order; an early chunk waits for the gap. */
export function pushPcm(seq: number, b64: string): void {
  if (seq < nextSeq) return;
  early.set(seq, b64);
  while (early.has(nextSeq)) {
    const chunk = early.get(nextSeq)!;
    early.delete(nextSeq);
    nextSeq++;
    try {
      schedule(pcmBuffer(chunk, streamRate));
    } catch {
      /* a bad chunk must not stop the rest */
    }
  }
}

/* ── clips (fallback) ─────────────────────────────────────────────────────── */

/** On `say { i, audio }`, in whatever order they arrive. Null audio = skipped sentence. */
export function enqueueClip(i: number, b64: string | null): void {
  clips[i] = b64 ?? null;
  const gen = generation;
  while (clips[cursor] !== undefined) {
    const clip = clips[cursor++];
    if (clip === null) continue;
    clipChain = clipChain
      .then(async () => {
        if (gen !== generation) return;
        const bytes = Uint8Array.from(atob(clip as string), (ch) => ch.charCodeAt(0));
        const buf = await context().decodeAudioData(bytes.buffer);
        if (gen === generation) schedule(buf);
      })
      .catch(() => undefined);
  }
}

/* ── state ────────────────────────────────────────────────────────────────── */

export function subscribe(fn: (speaking: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isSpeaking = (): boolean => active.size > 0;
