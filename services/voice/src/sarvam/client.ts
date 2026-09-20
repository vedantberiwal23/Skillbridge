import { config } from '../config.js';

/**
 * Sarvam request/response half — translation (`mayura:v1`) and batch synthesis
 * (`bulbul:v3`), used by the non-streaming fallback path.
 *
 * Synthesis scales with length, so one long request is the worst possible shape:
 * split into sentences and render them CONCURRENTLY, then stitch. The win is
 * concurrency, not batching — passing several `inputs` on one request is slower
 * than either.
 *
 * Sentence splitting must handle the Devanagari danda `।` or Hindi never splits.
 * A decimal point is not a sentence end — "2.5 bar" must stay one clause.
 */

/**
 * Two lists, because Sarvam's models do not cover the same set — and treating
 * them as one is what made a worker who picked Assamese get answered in Hindi.
 *
 *   UNDERSTOOD  saaras:v3 transcribes 22 Indian languages plus English, so this
 *               is what a worker may SPEAK and what the reply may be WRITTEN in.
 *   SPEAKABLE   bulbul:v3 has voices for 11 of them. That is the only list that
 *               decides what can be SAID out loud.
 *
 * A language in the first list but not the second still works: the question is
 * transcribed, the answer is written in that language, and it is read aloud by
 * the closest voice that shares the script — or, where no voice shares it
 * (Perso-Arabic, Ol Chiki, Meetei Mayek), shown as text and not spoken. What is
 * never acceptable is silently answering in a language nobody asked for.
 */
export const SPEAKABLE_LANGUAGES = [
  { code: 'en-IN', label: 'English', native: 'English' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  { code: 'bn-IN', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te-IN', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr-IN', label: 'Marathi', native: 'मराठी' },
  { code: 'gu-IN', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa-IN', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'od-IN', label: 'Odia', native: 'ଓଡ଼ିଆ' },
] as const;

/** Understood but unvoiced: saaras:v3 transcribes these, bulbul:v3 cannot speak them. */
export const UNVOICED_LANGUAGES = [
  { code: 'as-IN', label: 'Assamese', native: 'অসমীয়া' },
  { code: 'ur-IN', label: 'Urdu', native: 'اردو' },
  { code: 'ne-IN', label: 'Nepali', native: 'नेपाली' },
  { code: 'kok-IN', label: 'Konkani', native: 'कोंकणी' },
  { code: 'ks-IN', label: 'Kashmiri', native: 'کٲشُر' },
  { code: 'sd-IN', label: 'Sindhi', native: 'سنڌي' },
  { code: 'sa-IN', label: 'Sanskrit', native: 'संस्कृतम्' },
  { code: 'sat-IN', label: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ' },
  { code: 'mni-IN', label: 'Manipuri', native: 'ꯃꯤꯇꯩꯂꯣꯟ' },
  { code: 'brx-IN', label: 'Bodo', native: 'बड़ो' },
  { code: 'mai-IN', label: 'Maithili', native: 'मैथिली' },
  { code: 'doi-IN', label: 'Dogri', native: 'डोगरी' },
] as const;

/** Everything a worker may speak. */
export const LANGUAGES = [...SPEAKABLE_LANGUAGES, ...UNVOICED_LANGUAGES];

/** Can a worker ask in this language, and be answered in it in writing? */
export const isLanguage = (code: string): boolean =>
  LANGUAGES.some((l) => l.code === code);

/**
 * The same language, spelled differently by two Sarvam endpoints.
 *
 * `saaras:v3-realtime` reports Odia as `or-IN`; `bulbul:v3` and the batch API
 * use `od-IN`, and so does every list in this service. Left untranslated, a
 * detected `or-IN` matches nothing, the turn falls back to the picker's
 * language, and an Odia speaker on a Hindi interface is answered in Hindi —
 * with recognition having got it perfectly right.
 *
 * Normalised where detection enters the system (sarvam/stt.ts), so exactly one
 * spelling exists everywhere after that.
 */
const DETECTED_ALIASES: Record<string, string> = { 'or-IN': 'od-IN' };

export const normalizeDetected = (code: string | null): string | null =>
  code ? (DETECTED_ALIASES[code] ?? code) : code;

/** Is there a voice that can read this language aloud? */
export const isSpeakable = (code: string): boolean =>
  SPEAKABLE_LANGUAGES.some((l) => l.code === code);

/**
 * Technical terms must survive translation as English. Every Indian technician
 * says "hydraulic pump", not a calque — a translated term reads as wrong to the
 * people who actually speak the language. Terms are masked before translation
 * and restored after, so the EXPLANATION is translated and the TERM is not.
 *
 * Scoped to the engineering-maintenance vertical (FEATURES.md vertical focus).
 * Sourced per-org from the KB where the org has its own equipment vocabulary.
 */
export const GLOSSARY: readonly string[] = [
  'hydraulic pump',
  'solenoid valve',
  'pressure relief valve',
  'directional control valve',
  'actuator',
  'cylinder',
  'accumulator',
  'flow meter',
  'pressure gauge',
  'multimeter',
  'motor starter',
  'contactor',
  'overload relay',
  'circuit breaker',
  'busbar',
  'VFD',
  'PLC',
  'lockout-tagout',
  'LOTO',
  'PPE',
  'torque',
  'bearing',
  'coupling',
  'gearbox',
];

const GLOSSARY_SORTED = [...GLOSSARY].sort((a, b) => b.length - a.length);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Underscore-delimited tokens survive Sarvam translation untouched (measured);
 * XQ0QX-style tokens come back transliterated into the target script.
 */
function maskGlossary(text: string, extra: readonly string[] = []) {
  const found: string[] = [];
  const terms = extra.length ? [...GLOSSARY_SORTED, ...extra].sort((a, b) => b.length - a.length) : GLOSSARY_SORTED;
  let masked = text;
  for (const term of terms) {
    masked = masked.replace(new RegExp(`\\b${escapeRe(term)}\\b`, 'gi'), (match) => {
      const token = `__${found.length}__`;
      found.push(match);
      return token;
    });
  }
  return { masked, found };
}

/** Null when a mask did not survive — English beats transliterated gibberish. */
function unmaskGlossary(text: string, found: string[]): string | null {
  let out = text;
  found.forEach((original, i) => {
    out = out.replace(new RegExp(`_\\s*_\\s*${i}\\s*_\\s*_`, 'g'), original);
  });
  const restored = found.every((term) => out.includes(term));
  return restored && !/_\s*_\s*\d+\s*_\s*_/.test(out) ? out : null;
}

async function api<T>(pathname: string, body: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.sarvam.timeoutMs);
  try {
    const res = await fetch(config.sarvam.baseUrl + pathname, {
      method: 'POST',
      headers: { 'api-subscription-key': config.sarvam.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`sarvam ${pathname} ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text) as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error(`sarvam ${pathname}: timed out after ${config.sarvam.timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Numbers, percentages, counts — nothing to translate, and digits must not be rewritten. */
const skipTranslation = (s: string) => {
  const t = s.trim();
  return t.length < 2 || /^[\d\s.,%₹+\-/:()–—·|]+$/.test(t);
};

/**
 * NOT used on the question: the model reads Indic input directly, and
 * translating first measured ~1.2s of pure waiting. This is for rendering
 * English text (e.g. an SOP excerpt) into the worker's language.
 */
export async function translate(text: string, target: string, source = 'en-IN'): Promise<string> {
  if (skipTranslation(text) || target === source) return text;
  const { masked, found } = maskGlossary(text);
  // A string that is ONLY a technical term needs no translation.
  if (!masked.replace(/__\d+__/g, '').trim()) return text;
  const out = await api<{ translated_text?: string }>('/translate', {
    input: masked.slice(0, 900),
    source_language_code: source,
    target_language_code: target,
    model: config.sarvam.translateModel,
    mode: 'formal',
    enable_preprocessing: false,
  });
  if (!out.translated_text) return text;
  return unmaskGlossary(out.translated_text, found) ?? text;
}

/** bulbul:v3 hard-caps one input at ~500 chars and 400s above it. */
const MAX_INPUT = 450;

function pieces(text: string): string[] {
  const out: string[] = [];
  for (const p of text.split(/(?<=[।.!?])\s+/).map((s) => s.trim()).filter(Boolean)) {
    for (let i = 0; i < p.length; i += MAX_INPUT) out.push(p.slice(i, i + MAX_INPUT));
  }
  return out;
}

async function speakOne(input: string, language: string, speaker: string): Promise<Buffer | null> {
  const out = await api<{ audios?: string[] }>('/text-to-speech', {
    inputs: [input],
    target_language_code: language,
    speaker,
    model: config.sarvam.ttsModel,
    // v3 rejects pitch and loudness outright; only pace survives.
    pace: 1.0,
    speech_sample_rate: 22050,
    enable_preprocessing: true,
  });
  const b64 = out.audios?.[0];
  return b64 ? Buffer.from(b64, 'base64') : null;
}

/** Join WAV clips: first header survives, the rest contribute PCM, lengths rewritten. */
function concatWav(buffers: Buffer[]): Buffer {
  if (buffers.length === 1) return buffers[0]!;
  const dataOf = (buf: Buffer) => {
    // walk the chunk list — Sarvam's output has carried extra chunks before `data`
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString('ascii', off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      if (id === 'data') return { start: off + 8, size: Math.min(size, buf.length - off - 8) };
      off += 8 + size + (size % 2);
    }
    return null;
  };
  const first = dataOf(buffers[0]!);
  if (!first) return buffers[0]!;
  const body = Buffer.concat(
    buffers.flatMap((b) => {
      const d = dataOf(b);
      return d ? [b.subarray(d.start, d.start + d.size)] : [];
    })
  );
  const header = Buffer.from(buffers[0]!.subarray(0, first.start));
  header.writeUInt32LE(header.length + body.length - 8, 4);
  header.writeUInt32LE(body.length, first.start - 4);
  return Buffer.concat([header, body]);
}

/**
 * Batch synthesis — fallback only; the live path streams (see tts.ts). Returns a
 * base64 WAV. Long text is split into sentences rendered CONCURRENTLY: the win
 * is concurrency, not batching.
 */
export async function textToSpeech(
  text: string,
  options: { language: string; speaker?: string }
): Promise<string | null> {
  const clean = text.trim();
  if (!clean) return null;
  const speaker = options.speaker ?? config.sarvam.defaultSpeaker;
  const clips = await Promise.all(pieces(clean).map((p) => speakOne(p, options.language, speaker)));
  const bufs = clips.filter((b): b is Buffer => b !== null);
  return bufs.length ? concatWav(bufs).toString('base64') : null;
}
