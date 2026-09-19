'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '@/i18n/provider';

/**
 * The voice panel: hold-to-ask button and transcript display.
 *
 * This is the frontend half of the tap-a-part-and-ask loop. The seam with the
 * voice service (FRONTEND.md §6 / VOICE.md) is deliberately narrow:
 *
 *   in   — `partLabel`, set when the worker taps a hotspot on the model
 *   out  — onAskStart() / onAskEnd(), fired on button press and release
 *   in   — `transcript` and `reply`, rendered as they stream back
 *
 * Mic capture, the websocket, and ordered audio playback live on the other side
 * of that seam. Nothing here assumes how they work, so either half can land
 * first. Today no handler is wired, so the button is visibly inert rather than
 * pretending to listen.
 */
export interface AskPanelProps {
  /** Hotspot the worker tapped, if any — this is what "ask about it" refers to. */
  partLabel?: string;
  onAskStart?: () => void;
  onAskEnd?: () => void;
  transcript?: string;
  reply?: string;
}

export function AskPanel({
  partLabel,
  onAskStart,
  onAskEnd,
  transcript,
  reply,
}: AskPanelProps) {
  const { t } = useI18n();
  const [holding, setHolding] = useState(false);

  const start = useCallback(() => {
    setHolding(true);
    onAskStart?.();
  }, [onAskStart]);

  const end = useCallback(() => {
    setHolding(false);
    onAskEnd?.();
  }, [onAskEnd]);

  return (
    <section className="border-t border-border bg-card px-4 py-5">
      {partLabel ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {t('worker.askedAbout')}:{' '}
          <span className="font-semibold text-foreground">{partLabel}</span>
        </p>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">{t('worker.tapPart')}</p>
      )}

      <button
        type="button"
        // Pointer events rather than click: this is push-to-talk, and the worker
        // is often wearing gloves, so the target is deliberately oversized.
        onPointerDown={start}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={holding ? end : undefined}
        aria-pressed={holding}
        className={`flex min-h-16 w-full items-center justify-center gap-3 rounded-lg px-6 text-lg font-semibold transition-colors ${
          holding
            ? 'bg-danger text-danger-foreground'
            : 'bg-primary text-primary-foreground'
        }`}
      >
        <svg
          className="size-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
        {holding ? t('worker.listening') : t('worker.askAloud')}
      </button>

      {transcript ? (
        <p className="mt-4 text-base text-foreground">{transcript}</p>
      ) : null}

      {reply ? (
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">{reply}</p>
      ) : null}
    </section>
  );
}
