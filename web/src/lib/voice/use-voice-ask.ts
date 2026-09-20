'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { VOICE_LANGUAGE, INDIAN_LANGUAGES, type Locale } from '@/i18n/config';
import { openVoiceChannel, type ChannelState, type VoiceChannel, type VoiceTurn } from './channel';

export interface VoiceAskState {
  channel: ChannelState;
  /** Interim words while the worker is still speaking; replaced as it revises. */
  partial: string;
  /** What the recogniser finally settled on. */
  transcript: string;
  /** The tutor's reply, appended delta by delta as the model streams. */
  reply: string;
  error: string | null;
  /** Nothing with letters was heard. Silence is not a question. */
  empty: boolean;
  /**
   * The answer was retrieved from this organisation's own SOPs rather than the
   * model's general knowledge. Surfaced so the worker can see which of the two
   * they are being told — the whole claim of the product is that the first kind
   * exists.
   */
  grounded: boolean;
}

const EMPTY: VoiceAskState = {
  channel: 'connecting',
  partial: '',
  transcript: '',
  reply: '',
  error: null,
  empty: false,
  grounded: false,
};

/**
 * Owns one voice channel for as long as the screen is mounted, and turns the
 * AskPanel's press/release into a turn on it.
 *
 * ## Why the channel is opened on mount, not on press
 *
 * A channel is warm for up to 15 minutes across many turns, and its handshake —
 * websocket upgrade, token verification — costs real time. Opening it when the
 * screen mounts puts that cost where nobody is waiting, so the first press only
 * has to open the two Sarvam sockets. Pressing the button on a cold channel is
 * the one case where the worker would feel the whole stack connect.
 *
 * ## Why `begin` must stay synchronous
 *
 * `start()` runs inside the pointerdown handler and calls `startTurn`
 * synchronously for a reason that is easy to undo: mobile browsers only unlock
 * audio playback inside a real user gesture. Await anything before that call —
 * a token fetch, a state update, a dynamic import — and the gesture is over,
 * playback stays locked, and the tutor answers to a silent phone.
 */
export function useVoiceAsk(locale: string, part?: string | null, machine?: string | null) {
  const [state, setState] = useState<VoiceAskState>(EMPTY);
  const channelRef = useRef<VoiceChannel | null>(null);
  const turnRef = useRef<VoiceTurn | null>(null);
  // Read inside handlers rather than captured in deps: the worker can tap a
  // different part, or switch language, between turns without the channel
  // being torn down and re-handshaked. Written in an effect rather than during
  // render — a ref mutated mid-render is not safe under concurrent rendering,
  // where a render can be discarded after the write has already landed.
  const partRef = useRef<string | null | undefined>(part);
  const machineRef = useRef<string | null | undefined>(machine);
  const localeRef = useRef<string>(locale);

  useEffect(() => {
    partRef.current = part;
    machineRef.current = machine;
    localeRef.current = locale;
  }, [part, machine, locale]);

  useEffect(() => {
    const channel = openVoiceChannel({
      onState: (s) => setState((prev) => ({ ...prev, channel: s })),
      onFatal: (_code, message) => setState((prev) => ({ ...prev, error: message })),
    });
    channelRef.current = channel;

    return () => {
      turnRef.current?.cancel();
      turnRef.current = null;
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || turnRef.current) return;

    // `grounded` resets with the rest: a badge left over from the previous
    // question would claim the new answer came from the SOPs.
    setState((prev) => ({
      ...prev,
      partial: '',
      transcript: '',
      reply: '',
      error: null,
      empty: false,
      grounded: false,
    }));

    const voiceLang =
      INDIAN_LANGUAGES.find((l) => l.code === localeRef.current)?.voiceCode ||
      VOICE_LANGUAGE[localeRef.current as Locale] ||
      'hi-IN';

    turnRef.current = channel.startTurn(
      {
        language: voiceLang,
        explicit: true,
        part: partRef.current ?? null,
        machine: machineRef.current ?? null,
      },
      {
        // A partial must never shorten what is already held: the recogniser
        // replays a segment from the start in bursts, and last-write-wins makes
        // the transcript flicker backwards mid-question.
        onPartial: (text) =>
          setState((prev) =>
            text.length < prev.partial.length && prev.partial.startsWith(text)
              ? prev
              : { ...prev, partial: text }
          ),
        onFinal: (text) => setState((prev) => ({ ...prev, transcript: text, partial: '' })),
        onDelta: (text) => setState((prev) => ({ ...prev, reply: prev.reply + text })),
        onReply: (reply) =>
          setState((prev) => ({
            ...prev,
            reply: reply.text,
            transcript: reply.transcript,
            grounded: reply.grounded,
          })),
        onEmpty: () => setState((prev) => ({ ...prev, empty: true, partial: '' })),
        onError: (_code, message) => setState((prev) => ({ ...prev, error: message })),
        onDone: () => {
          turnRef.current = null;
        },
      }
    );
  }, []);

  /** Button release ends capture; the reply keeps streaming after this returns. */
  const end = useCallback(() => {
    turnRef.current?.stop();
  }, []);

  return { ...state, start, end };
}
