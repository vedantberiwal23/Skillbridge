'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '@/i18n/provider';
import type { ChannelState } from '@/lib/voice/channel';

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
 * of that seam — `useVoiceAsk` owns all three and passes the results down. This
 * component still knows nothing about how they work.
 *
 * The button disables itself until the channel reports `ready`. Holding it
 * against a channel that is still connecting captures audio nobody is
 * listening to, which reads to the worker as the tutor ignoring them.
 */
export interface AskPanelProps {
  /** Hotspot the worker tapped, if any — this is what "ask about it" refers to. */
  partLabel?: string;
  onAskStart?: () => void;
  onAskEnd?: () => void;
  transcript?: string;
  reply?: string;
  /** Gates the button: audio captured before `ready` goes nowhere. */
  channelState?: ChannelState;
  error?: string | null;
  /** The recogniser heard no letters at all. */
  empty?: boolean;
}

export function AskPanel({
  partLabel,
  onAskStart,
  onAskEnd,
  transcript,
  reply,
  channelState = 'ready',
  error,
  empty,
}: AskPanelProps) {
  const { t } = useI18n();
  const [holding, setHolding] = useState(false);
  const ready = channelState === 'ready';

  const start = useCallback(() => {
    if (!ready) return;
    setHolding(true);
    // Synchronous on purpose: this runs inside the pointerdown gesture, which
    // is the only moment a mobile browser will unlock audio playback.
    onAskStart?.();
  }, [onAskStart, ready]);

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
        disabled={!ready}
        className={`flex min-h-16 w-full items-center justify-center gap-3 rounded-lg px-6 text-lg font-semibold transition-colors ${
          !ready
            ? 'cursor-not-allowed bg-muted text-muted-foreground'
            : holding
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
        {!ready
          ? t('worker.voiceConnecting')
          : holding
            ? t('worker.listening')
            : t('worker.askAloud')}
      </button>

      {channelState === 'unavailable' ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('worker.voiceUnavailable')}</p>
      ) : null}

      {empty ? <p className="mt-3 text-sm text-muted-foreground">{t('worker.heardNothing')}</p> : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      {transcript ? (
        <p className="mt-4 text-base text-foreground">{transcript}</p>
      ) : null}

      {reply ? (
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">{reply}</p>
      ) : null}
    </section>
  );
}
