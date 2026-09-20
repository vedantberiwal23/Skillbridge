/**
 * What the screen tells the tutor it is showing.
 *
 * The tap-a-part loop used to send one thing: the label of the hotspot. So a
 * worker looking at the Dynex checkball piston pump and asking "what does this
 * do?" reached the model as those five words plus "Shaft Seal" — nothing said
 * which machine, which lesson, or what the lesson had already told them. The
 * answer came back about seals in general.
 *
 * This module builds the description the voice service receives with every
 * question (services/voice/src/voice/context.ts holds the matching type and
 * sanitises it on arrival). It is deliberately built from data the screen
 * already renders, so any lesson — every trade, every machine in the
 * curriculum — is covered by the same code with nothing per-machine to author.
 *
 * It is context, not authority: the org's own SOPs still decide values and
 * steps, and the service treats this text as reference rather than instruction.
 */

import type { LessonContent, TradeTrack } from '@/data/curriculum';

/** Mirrors ScreenContext in services/voice/src/voice/context.ts. */
export interface ScreenContext {
  screen?: string;
  title?: string;
  subtitle?: string;
  machine?: string;
  track?: string;
  summary?: string;
  part?: { label?: string; description?: string; safety?: string };
  parts?: { label?: string; description?: string }[];
  objectives?: string[];
  steps?: { n?: number; title?: string; instruction?: string; caution?: string }[];
}

/**
 * The lesson screen: the machine, the part in focus with its own description
 * and safety rule, the other parts, the objectives and the SOP steps on screen.
 *
 * `selectedPartId` is the hotspot the worker last tapped — it is what "this"
 * means, so it is named separately from the rest of the components.
 */
export function lessonContext(
  lesson: LessonContent,
  selectedPartId?: string | null,
  track?: Pick<TradeTrack, 'name' | 'digitalTwin'> | null
): ScreenContext {
  const components = lesson.simulationConfig?.components ?? [];
  const selected = components.find((c) => c.id === selectedPartId);

  return {
    screen: 'lesson',
    title: lesson.title,
    subtitle: lesson.subtitle,
    machine: track?.digitalTwin || lesson.simulationConfig?.title,
    track: track?.name,
    summary: lesson.summary,
    part: selected
      ? { label: selected.label, description: selected.description, safety: selected.safetyRule }
      : undefined,
    parts: components.map((c) => ({ label: c.label, description: c.description })),
    objectives: lesson.objectives,
    steps: lesson.procedureSteps.map((s) => ({
      n: s.step,
      title: s.title,
      instruction: s.instruction,
      caution: s.safetyCaution,
    })),
  };
}

/**
 * Any other screen that grows a tutor: pass what that screen is about and, if
 * it has one, the item in focus. Kept generic on purpose — a screen should
 * never need a new builder here just to be understood.
 */
export function screenContext(input: ScreenContext): ScreenContext {
  return input;
}

/**
 * The Studio's machine twin: the model actually on screen, including one the
 * admin just uploaded or scanned.
 *
 * Without this the tutor is handed a bare name — often a filename — and a
 * worker asking "what is this file I uploaded?" gets an answer about nothing,
 * or a flat "I do not see any model". The twin engine already knows what it
 * built: where the geometry came from, and which components it separated. That
 * is what a person looking at the screen can see, so it is what the tutor is
 * told.
 */
export function twinContext(input: {
  machine: string;
  /** How the twin was made: an uploaded CAD assembly, or a photo reconstruction. */
  source?: 'cad' | 'photogrammetry' | 'sample' | null;
  /** The file the admin uploaded, when this twin came from one. */
  fileName?: string | null;
  /** Parts the engine separated. A fresh photo scan usually has none yet. */
  parts?: { label?: string; description?: string }[];
  /** The part the worker tapped, if any. */
  part?: { label?: string; description?: string; safety?: string };
}): ScreenContext {
  const origin =
    input.source === 'cad'
      ? `A CAD assembly the team uploaded${input.fileName ? ` (${input.fileName})` : ''}, shown as a 3D model.`
      : input.source === 'photogrammetry'
        ? `A 3D model reconstructed from photographs of the real machine${input.fileName ? ` (${input.fileName})` : ''}.`
        : 'A 3D model of this machine, shown in the Studio viewer.';

  const parts = (input.parts ?? []).filter((p) => p.label);
  const partNote = parts.length
    ? `The engine separated ${parts.length} component${parts.length === 1 ? '' : 's'}.`
    : 'Its components have not been labelled yet, so questions are about the machine as a whole.';

  return {
    screen: 'twin',
    title: input.machine,
    machine: input.machine,
    summary: `${origin} ${partNote}`,
    parts: parts.length ? parts : undefined,
    part: input.part,
  };
}
