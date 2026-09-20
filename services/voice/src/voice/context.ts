/**
 * What the worker is LOOKING AT while they ask.
 *
 * Without this, the tutor only ever received the question and a tapped part
 * label, so "what does this pump do?" arrived with nothing to bind "this" to —
 * the model answered about pumps in general, which reads on the shop floor as
 * the tutor not looking at the same screen as the worker.
 *
 * The screen sends a small, flat description of itself: the lesson or machine
 * on screen, its steps and objectives, and the selected part with its own
 * description and safety rule. That is enough for the model to resolve "this",
 * "it" and "यह", and enough to make the Knowledge Base query specific
 * ("Dynex checkball piston pump shaft seal" rather than "what is this").
 *
 * Nothing here is authority. This text ARRIVES FROM THE BROWSER, so it is
 * treated exactly like the question: sanitised, clamped, and presented to the
 * model as reference material rather than instruction. Values and procedure
 * steps still come from the org's own SOPs (grounding.ts), which outrank it —
 * coach.ts says so in the prompt.
 */

/** The wire shape. Mirrored on the client in web/src/lib/voice/context.ts. */
export interface ScreenContext {
  /** What kind of screen this is: 'lesson', 'assessment', 'twin', 'plan'… */
  screen?: string;
  /** Headline of the thing on screen — usually the lesson or machine name. */
  title?: string;
  subtitle?: string;
  /** The machine or digital twin the screen belongs to, when it has one. */
  machine?: string;
  /** Trade or track, e.g. "Hydraulics Maintenance Technician". */
  track?: string;
  summary?: string;
  /** The part the worker has selected — what "this" refers to first. */
  part?: { label?: string; description?: string; safety?: string };
  /** Other parts visible on the same screen, so "the one next to it" resolves. */
  parts?: { label?: string; description?: string }[];
  objectives?: string[];
  steps?: { n?: number; title?: string; instruction?: string; caution?: string }[];
}

/* Caps. Every one of these is paid for on every turn of every channel, and all
   of it is client-supplied, so the limits are deliberately tight. */
const MAX_SHORT = 120;
const MAX_LINE = 240;
const MAX_STEPS = 12;
const MAX_PARTS = 16;
const MAX_OBJECTIVES = 8;
const MAX_TOTAL_CHARS = 2600;

/**
 * Untrusted text into a prompt: drop control characters and the angle brackets
 * that would let it close the <screen> block it is rendered inside, collapse
 * whitespace, and clamp.
 */
const clean = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\p{Cc}\p{Cf}<>]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
};

const list = <T,>(value: unknown, max: number): T[] =>
  Array.isArray(value) ? (value.slice(0, max) as T[]) : [];

/** Returns null when the screen said nothing usable, so callers can skip it. */
export function sanitizeContext(raw: unknown): ScreenContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const p = (r.part ?? {}) as Record<string, unknown>;

  const ctx: ScreenContext = {
    screen: clean(r.screen, 40),
    title: clean(r.title, MAX_SHORT),
    subtitle: clean(r.subtitle, MAX_LINE),
    machine: clean(r.machine, MAX_SHORT),
    track: clean(r.track, MAX_SHORT),
    summary: clean(r.summary, MAX_LINE),
    part: {
      label: clean(p.label, 80),
      description: clean(p.description, MAX_LINE),
      safety: clean(p.safety, MAX_LINE),
    },
    parts: list<Record<string, unknown>>(r.parts, MAX_PARTS)
      .map((x) => ({ label: clean(x?.label, 80), description: clean(x?.description, MAX_SHORT) }))
      .filter((x) => x.label),
    objectives: list<unknown>(r.objectives, MAX_OBJECTIVES)
      .map((x) => clean(x, MAX_LINE))
      .filter(Boolean),
    steps: list<Record<string, unknown>>(r.steps, MAX_STEPS)
      .map((x) => ({
        n: Number.isFinite(Number(x?.n)) ? Number(x!.n) : undefined,
        title: clean(x?.title, MAX_SHORT),
        instruction: clean(x?.instruction, MAX_LINE),
        caution: clean(x?.caution, MAX_LINE),
      }))
      .filter((x) => x.title || x.instruction),
  };

  return describeContext(ctx) ? ctx : null;
}

/**
 * The block the model reads. Plain lines rather than JSON: the same facts cost
 * fewer tokens, and the model is being asked to talk about them, not parse them.
 */
export function describeContext(ctx: ScreenContext | null | undefined): string {
  if (!ctx) return '';
  const lines: string[] = [];
  const add = (label: string, value?: string) => {
    if (value) lines.push(`${label}: ${value}`);
  };

  add('Screen', ctx.screen);
  add('Lesson or procedure on screen', ctx.title);
  add('About', ctx.subtitle);
  add('Machine', ctx.machine);
  add('Trade', ctx.track);
  add('Summary', ctx.summary);

  const part = ctx.part;
  if (part?.label) {
    lines.push(`SELECTED PART (this is what "this", "it" or "यह" means): ${part.label}`);
    if (part.description) lines.push(`  what it does: ${part.description}`);
    if (part.safety) lines.push(`  safety rule for it: ${part.safety}`);
  }

  if (ctx.parts?.length) {
    lines.push('Other parts on this screen:');
    for (const p of ctx.parts) {
      if (p.label === part?.label) continue;
      lines.push(`  - ${p.label}${p.description ? `: ${p.description}` : ''}`);
    }
  }

  if (ctx.objectives?.length) {
    lines.push('What this lesson teaches:');
    for (const o of ctx.objectives) lines.push(`  - ${o}`);
  }

  if (ctx.steps?.length) {
    lines.push('Procedure steps shown on screen:');
    for (const s of ctx.steps) {
      const head = [s.n ? `Step ${s.n}` : null, s.title].filter(Boolean).join(': ');
      lines.push(`  - ${head || 'Step'}${s.instruction ? ` — ${s.instruction}` : ''}`);
      if (s.caution) lines.push(`    caution: ${s.caution}`);
    }
  }

  // Trimmed on a line boundary: half a step reads as a different step.
  let out = '';
  for (const line of lines) {
    if (out.length + line.length + 1 > MAX_TOTAL_CHARS) break;
    out += (out ? '\n' : '') + line;
  }
  return out;
}

/**
 * The retrieval query for this question.
 *
 * A worker looking at a pump and saying "what does this do" produces a query
 * with no nouns in it, which matches nothing in the org's SOPs. Naming the part
 * and the machine turns the same question into a retrievable one. Bounded
 * because retrieval is bounded.
 */
export function retrievalQuery(question: string, ctx?: ScreenContext | null): string {
  const bits = [ctx?.part?.label, ctx?.title, ctx?.machine]
    .map((b) => clean(b, MAX_SHORT))
    .filter(Boolean);
  const seen = new Set<string>();
  const prefix = bits.filter((b) => {
    const k = b.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...prefix, question].join(' ').trim().slice(0, 1000);
}
