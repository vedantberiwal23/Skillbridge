/**
 * What the tutor SAYS, and the text rules that keep it fast.
 *
 * Everything here is pure — no sockets, no vendors — so it is the part of the
 * voice path that unit tests can pin down exactly. turn.ts decides WHEN these
 * run; this file decides what they return.
 */

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Conversation carried into each call. Every message is paid for on every turn,
 * and history arrives from the browser, so it is clamped on count and length.
 */
const MAX_HISTORY = 6;
const MAX_MESSAGE_CHARS = 600;

/** A ceiling, not a target — the prompt sets the length. */
export const MAX_TOKENS = 640;

/* ── the tutor's voice ───────────────────────────────────────────────────────
   The question is NOT translated to English first (measured ~1.2s of pure
   waiting for no benefit). The model reads Devanagari and Hinglish directly and
   answers in the language it was asked in; the voice then follows the script it
   actually wrote in (languageOfText).
   ────────────────────────────────────────────────────────────────────────────*/
const PERSONA = [
  'You are the SkillBridge shop-floor tutor, speaking out loud to a maintenance technician or machine operator in India.',
  'Their hands are usually busy, so they are listening, not reading.',
  'Answer in about 50 to 90 words: three to five sentences of plain spoken prose.',
  'Your FIRST sentence must be short — under ten words — and answer the question head on.',
  'No markdown, no lists, no headings, no emoji — this is heard, not read. Say steps as "first… then… finally…".',
  '',
  'GROUNDING — this is the most important rule:',
  'When company procedures are provided below, answer from them and follow their steps and values exactly.',
  'Never invent a torque value, pressure, setting, part number or procedure step. If the procedures do not cover the question, say so plainly and tell them to check with their supervisor.',
  'For anything involving isolation, lockout-tagout, pressure release, electrical work or PPE: never shortcut or reorder the procedure, and if it is not in the procedures, tell them to stop and ask their supervisor.',
  '',
  'The worker may ask in Hindi, Marathi, Tamil or any Indian language, often mixing English words, in Roman or native script.',
  'Understand it as asked — never ask them to repeat it.',
  '',
  "LANGUAGE — reply in the language the worker spoke, in that language's own script:",
  '  Hindi or Hinglish (Roman or Devanagari) → Hindi, in Devanagari. Marathi → Devanagari.',
  '  Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati, Punjabi, Odia → their own scripts. English → English.',
  '',
  'TECHNICAL TERMS STAY IN ENGLISH, in Latin letters, exactly as a technician says them aloud — never transliterate them:',
  'hydraulic pump, solenoid valve, pressure gauge, bearing, gearbox, PLC, VFD, contactor, lockout-tagout, PPE, torque.',
  'Right:  "Hydraulic pump चालू करने से पहले pressure gauge ज़ीरो पर होना चाहिए।"',
  'Wrong:  "हाइड्रोलिक पंप चालू करने से पहले प्रेशर गेज ज़ीरो पर होना चाहिए।"',
];

const LANGUAGE_NAMES: Record<string, [string, string]> = {
  'hi-IN': ['Hindi', 'Devanagari'],
  'mr-IN': ['Marathi', 'Devanagari'],
  'bn-IN': ['Bengali', 'Bengali'],
  'ta-IN': ['Tamil', 'Tamil'],
  'te-IN': ['Telugu', 'Telugu'],
  'kn-IN': ['Kannada', 'Kannada'],
  'ml-IN': ['Malayalam', 'Malayalam'],
  'gu-IN': ['Gujarati', 'Gujarati'],
  'pa-IN': ['Punjabi', 'Gurmukhi'],
  'od-IN': ['Odia', 'Odia'],
  'en-IN': ['English', 'Latin'],
};

/**
 * The system prompt for one reply.
 *
 * `spoken` is set only when the language is KNOWN — picked in the panel, heard
 * on the previous question, or detected on this question's final transcript.
 * Never from the romanised interim transcript: naming a language from that is a
 * guess, and a wrong one is worse than none.
 *
 * `sources` is the org's own SOP text for this question, or null when the org
 * has no knowledge base yet.
 */
export function systemFor(opts: { spoken?: string | null; sources?: string | null } = {}): string {
  const parts = [PERSONA.join('\n')];
  const name = opts.spoken ? LANGUAGE_NAMES[opts.spoken] : undefined;
  if (name) {
    parts.push(
      opts.spoken === 'en-IN'
        ? 'The worker is speaking English. Reply in English.'
        : `The worker is speaking ${name[0]}. Reply in ${name[0]}, in ${name[1]} script — keeping technical terms in English, as above.`
    );
  }
  parts.push(
    opts.sources
      ? `COMPANY PROCEDURES (the only authority for steps and values):\n<procedures>\n${opts.sources}\n</procedures>`
      : 'No company procedures were found for this question. Give general guidance only, say that it is general, and for any safety-critical step tell them to follow their site procedure and ask their supervisor.'
  );
  return parts.join('\n\n');
}

export function messagesFrom(history: unknown, asked: string): ChatMessage[] {
  const past = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY)
    .filter(
      (m): m is { role: string; content: unknown } =>
        Boolean(m) && typeof m === 'object' && 'role' in m && 'content' in m && Boolean(m.content)
    )
    .map((m): ChatMessage => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, MAX_MESSAGE_CHARS),
    }));
  // Bedrock rejects a conversation that does not start with a user turn or that
  // repeats a role; merge rather than drop so no context is silently lost.
  const out: ChatMessage[] = [];
  for (const m of [...past, { role: 'user' as const, content: asked }]) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n${m.content}`;
    else if (out.length || m.role === 'user') out.push({ ...m });
  }
  return out;
}

/* ── which voice should speak this text ──────────────────────────────────────
   Decided from the script the model actually wrote. Where one script serves
   several languages (Devanagari: Hindi and Marathi) the recogniser decides.
   ────────────────────────────────────────────────────────────────────────────*/
const SCRIPTS: [RegExp, string[]][] = [
  [/[ঀ-৿]/, ['bn-IN']],
  [/[஀-௿]/, ['ta-IN']],
  [/[ఀ-౿]/, ['te-IN']],
  [/[ಀ-೿]/, ['kn-IN']],
  [/[ഀ-ൿ]/, ['ml-IN']],
  [/[઀-૿]/, ['gu-IN']],
  [/[਀-੿]/, ['pa-IN']],
  [/[଀-୿]/, ['od-IN']],
  [/[ऀ-ॿ]/, ['hi-IN', 'mr-IN']],
];

export function languageOfText(text: string, preferred?: string | null): string {
  for (const [re, langs] of SCRIPTS) {
    if (re.test(text)) return preferred && langs.includes(preferred) ? preferred : langs[0]!;
  }
  return 'en-IN';
}

/**
 * Enough text to know the script. A reply often OPENS with a Latin technical
 * term ("Hydraulic pump को…"), so the first token alone would say English.
 * Free: the speech engine will not start before 30 characters anyway.
 */
export const scriptKnown = (text: string): boolean =>
  /[^\p{ASCII}]/u.test(text) || text.length >= 24;

export function wordsOf(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[.,!?;:।॥()"“”'‘’—–-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export const wordCount = (s: string): number => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/** The same two-word phrase three times within fifteen words — a model loop. */
export function repeatsItself(words: string[]): boolean {
  for (let i = 0; i + 1 < words.length; i++) {
    const window = words.slice(Math.max(0, i - 13), i + 2);
    const bigram = `${words[i]} ${words[i + 1]}`;
    let n = 0;
    for (let k = 0; k + 1 < window.length; k++) if (`${window[k]} ${window[k + 1]}` === bigram) n++;
    if (n >= 3) return true;
  }
  return false;
}

/** A misfire rather than an answer: a loop, or a FINISHED reply far too short. */
export function looksDegenerate(text: string, { done = false } = {}): boolean {
  const words = wordsOf(text);
  if (repeatsItself(words.slice(0, 15))) return true;
  return done && words.length < 8;
}

/**
 * Is this answer written for the language the worker spoke?
 *
 * Technical terms are English BY DESIGN, so Latin letters alone prove nothing.
 * An Indic answer is only 'wrong' once it has six words with no native script at
 * all, or is in a different native script.
 */
export function scriptFits(text: string, language: string): 'right' | 'wrong' | 'unknown' {
  const t = String(text || '');
  const native = SCRIPTS.find(([re]) => re.test(t));
  const words = t.trim().split(/\s+/).filter(Boolean).length;
  if (language === 'en-IN') {
    if (native) return 'wrong';
    return words >= 6 ? 'right' : 'unknown';
  }
  if (native) return native[1].includes(language) ? 'right' : 'wrong';
  return words >= 6 ? 'wrong' : 'unknown';
}

/* ── reconciling a speculative start against the final ───────────────────────
   The early start answers Sarvam's FAST interim transcript, which arrives
   ROMANISED for every language, while the final arrives in native script. They
   can never be compared as strings. They are compared as consonant skeletons in
   coarse sound classes instead — every Brahmic Unicode block is laid out in
   parallel, so one offset table covers all nine scripts.
   ────────────────────────────────────────────────────────────────────────────*/
const INDIC_BLOCKS = [0x0900, 0x0980, 0x0a00, 0x0a80, 0x0b00, 0x0b80, 0x0c00, 0x0c80, 0x0d00];
const OFFSET_CLASS: Record<number, string> = {
  0x01: 'n', 0x02: 'n',
  0x15: 'k', 0x16: 'k', 0x17: 'k', 0x18: 'k', 0x19: 'n',
  0x1a: 'c', 0x1b: 'c', 0x1c: 'c', 0x1d: 'c', 0x1e: 'n',
  0x1f: 't', 0x20: 't', 0x21: 't', 0x22: 't', 0x23: 'n',
  0x24: 't', 0x25: 't', 0x26: 't', 0x27: 't', 0x28: 'n', 0x29: 'n',
  0x2a: 'p', 0x2b: 'p', 0x2c: 'p', 0x2d: 'p', 0x2e: 'n',
  0x2f: 'y', 0x30: 'r', 0x31: 'r', 0x32: 'l', 0x33: 'l', 0x34: 'l', 0x35: 'v',
  0x36: 's', 0x37: 's', 0x38: 's', 0x39: 'h',
  0x58: 'k', 0x59: 'k', 0x5a: 'k', 0x5b: 'c', 0x5c: 't', 0x5d: 't', 0x5e: 'p', 0x5f: 'y',
};
const LATIN_DIGRAPHS: [string, string][] = [
  ['chh', 'c'], ['ch', 'c'], ['jh', 'c'], ['sh', 's'], ['ph', 'p'], ['bh', 'p'],
  ['th', 't'], ['dh', 't'], ['kh', 'k'], ['gh', 'k'],
];
const LATIN_SINGLE: Record<string, string> = {
  b: 'p', f: 'p', d: 't', g: 'k', j: 'c', z: 'c', q: 'k', w: 'v', x: 'k', c: 'k', m: 'n',
};

export function skeleton(word: string): string {
  const w = String(word || '').toLowerCase();
  let out = '';
  for (let i = 0; i < w.length; i++) {
    const cp = w.codePointAt(i)!;
    const block = INDIC_BLOCKS.find((b) => cp >= b && cp < b + 0x80);
    if (block !== undefined) {
      out += OFFSET_CLASS[cp - block] ?? '';
      continue;
    }
    const ch = w[i]!;
    if (!/[a-z]/.test(ch)) continue;
    const dg = LATIN_DIGRAPHS.find(([d]) => w.startsWith(d, i));
    if (dg) {
      out += dg[1];
      i += dg[0].length - 1;
      continue;
    }
    if ('aeiou'.includes(ch)) continue;
    out += LATIN_SINGLE[ch] ?? ch;
  }
  return out.replace(/(.)\1+/g, '$1');
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return 1 - d[a.length]![b.length]! / Math.max(a.length, b.length);
}

const close = (x: string, y: string) => similarity(x, y) >= 0.75 || (similarity(x, y) >= 0.6 && x[0] === y[0]);
const contentSkeletons = (s: string) => String(s || '').split(/\s+/).map(skeleton).filter((k) => k.length >= 3);

/** Every content word the FINAL heard can be found in the guess. */
export function sameQuestion(guess: string, final: string): boolean {
  const g = String(guess || '').split(/\s+/).map(skeleton).filter(Boolean);
  return contentSkeletons(final).every((f) => g.some((x) => close(f, x)));
}

/** Does the answer's opening name something the final heard? */
export function mentionsAny(answer: string, final: string): boolean {
  const a = String(answer || '').split(/\s+/).map(skeleton).filter(Boolean);
  return contentSkeletons(final).some((f) => a.some((x) => close(f, x)));
}

/**
 * Mostly Latin WORDS? Counted by word, not letter: Indic vowel signs are not
 * letters, so by letters a mostly-Devanagari sentence reads as "Latin".
 */
export function isLatin(text: string): boolean {
  const words = String(text || '').split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (!words.length) return false;
  const latin = words.filter((w) => /\p{Script=Latin}/u.test(w) && !/[^\p{Script=Latin}\p{P}\p{N}]/u.test(w));
  return latin.length / words.length > 0.5;
}

/** Languages a model reads correctly from a romanised question. */
const ROMAN_SAFE = new Set(['en-IN', 'hi-IN']);

/**
 * Throw the early start away and begin again from the final transcript?
 *  - the final has materially more words than the guess was built on, or
 *  - the guess was TOLD a language and the final heard a different one, or
 *  - untold, the worker spoke a language other than English/Hindi and the guess
 *    was built on romanised text (models read romanised Marathi/Bengali as Hinglish).
 */
export function needsRestart(
  gen: { input: string; spoken: string | null },
  transcript: string,
  finalLanguage: string | null
): boolean {
  if (wordCount(transcript) > wordCount(gen.input) + 1) return true;
  if (gen.spoken && finalLanguage) return gen.spoken !== finalLanguage;
  return Boolean(
    finalLanguage && !ROMAN_SAFE.has(finalLanguage) && isLatin(gen.input) && !isLatin(transcript)
  );
}

/* ── sentence boundaries ─────────────────────────────────────────────────────
   Devanagari ends sentences with "।" — matched alongside the Latin terminators
   or Hindi never splits. A decimal point is not a sentence end: "2.5 bar" must
   stay one clause, so a "." only counts when it is not between two digits.
   ────────────────────────────────────────────────────────────────────────────*/
const SENTENCE_END = /([।!?]|(?<!\d)\.(?!\d))\s/;

/** Shorter than this and a piece is not worth its own synthesis round trip. */
const MIN_PIECE = 12;

/**
 * Split complete sentences off the front of a buffer.
 *
 * A too-short sentence merges FORWARD into the next. It must not `break`: a
 * reply opening "Yes. The pump…" would otherwise wedge on that first sentence
 * and nothing would be dispatched until end-of-stream.
 */
export function cutSentences(buffer: string): { sentences: string[]; rest: string } {
  const out: string[] = [];
  let rest = buffer;
  let scan = 0;
  for (;;) {
    const m = rest.slice(scan).match(SENTENCE_END);
    if (!m || m.index === undefined) break;
    const end = scan + m.index + m[0].length;
    const piece = rest.slice(0, end).trim();
    if (piece.length < MIN_PIECE) {
      scan = end;
      continue;
    }
    out.push(piece);
    rest = rest.slice(end);
    scan = 0;
  }
  return { sentences: out, rest };
}

/** Where the sentence containing `at` begins — the safe place to resume speaking. */
export function sentenceStartBefore(text: string, at: number): number {
  const s = String(text || '');
  const limit = Math.max(0, Math.min(at, s.length));
  const re = new RegExp(SENTENCE_END.source, 'g');
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) && m.index + m[0].length <= limit) start = m.index + m[0].length;
  return start;
}
