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

export const LANGUAGES = [
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

export const isLanguage = (code: string): boolean =>
  LANGUAGES.some((l) => l.code === code);

/**
 * Technical terms must survive translation as English.
 * Terms are masked before translation and restored after.
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

/**
 * Split text on sentence boundaries:
 * - Devanagari danda `।`
 * - Standard punctuation `.` / `?` / `!`
 * - Does NOT split on decimal numbers (e.g. 2.5 bar)
 */
export function splitSentences(text: string): string[] {
  if (!text.trim()) return [];

  // Regex matches sentence terminators that are not surrounded by digits
  const parts = text.split(/(?<=[।?!]|\.(?!\d))\s+/u);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export async function translate(
  text: string,
  target: string,
  source = 'en-IN'
): Promise<string> {
  if (!text.trim()) return text;
  if (target === source) return text;

  // Mask glossary terms
  const masks: { placeholder: string; original: string }[] = [];
  let maskedText = text;

  GLOSSARY.forEach((term, idx) => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    if (regex.test(maskedText)) {
      const placeholder = `__TERM_${idx}__`;
      masks.push({ placeholder, original: term });
      maskedText = maskedText.replace(regex, placeholder);
    }
  });

  const res = await fetch(`${config.sarvam.baseUrl}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': config.sarvam.apiKey,
    },
    body: JSON.stringify({
      input: maskedText,
      source_language_code: source,
      target_language_code: target,
      model: config.sarvam.translateModel,
    }),
  });

  if (!res.ok) {
    throw new Error(`Sarvam translate failed with status ${res.status}`);
  }

  const data = (await res.json()) as { translated_text?: string };
  let result = data.translated_text || text;

  // Unmask glossary terms
  for (const { placeholder, original } of masks) {
    result = result.replaceAll(placeholder, original);
  }

  return result;
}

/** Batch synthesis — fallback only; live path streams (see tts.ts). */
export async function textToSpeech(
  text: string,
  options: { language: string; speaker?: string }
): Promise<string | null> {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;

  // Render sentences concurrently
  const renders = sentences.map(async (sentence) => {
    const res = await fetch(`${config.sarvam.baseUrl}/text-to-speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': config.sarvam.apiKey,
      },
      body: JSON.stringify({
        inputs: [sentence],
        target_language_code: options.language,
        speaker: options.speaker ?? config.sarvam.defaultSpeaker,
        model: config.sarvam.ttsModel,
      }),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { audios?: string[] };
    return data.audios?.[0] ?? null;
  });

  const audios = await Promise.all(renders);
  const validAudios = audios.filter(Boolean) as string[];

  return validAudios[0] ?? null;
}
