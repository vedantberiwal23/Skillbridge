import WebSocket from 'ws';
import { config } from '../config.js';
import { normalizeDetected } from './client.js';

/**
 * Sarvam realtime speech-to-text — `saaras:v3-realtime`.
 *
 * `saaras:v3` and `saaras:v3-realtime` are DIFFERENT endpoints. The batch one
 * cannot start until the audio stops, which puts the whole of recognition on the
 * critical path and leaves the worker unable to tell a live mic from a dead one.
 * The realtime endpoint transcribes while audio is still arriving.
 *
 *   audio in : raw linear16 PCM, 16 kHz mono, base64 inside a JSON frame
 *   text out : transcript.partial (interim) then transcript.final (per utterance)
 *
 * endpointing=manual: this is push-to-talk, so we know when the turn starts and
 * ends — better than having a VAD infer it from silence.
 *
 * language_code=auto is this endpoint's detection value, and is NOT the batch
 * API's — that one spells it `unknown`. The realtime endpoint also spells Odia
 * `or-IN` where the rest of Sarvam uses `od-IN`, which is why detected codes are
 * normalised before they leave this file.
 */

export interface RealtimeSttOptions {
  /** BCP-47 code, or 'auto' to let Sarvam detect. */
  readonly language?: string;
  readonly onPartial?: (text: string, language: string | null) => void;
  readonly onFinal?: (text: string, language: string | null) => void;
  readonly onError?: (message: string) => void;
}

export interface RealtimeSttSession {
  sendAudio(base64Frame: string): void;
  /** Close the turn and resolve with whatever was recognised. */
  finish(): Promise<{ transcript: string; language: string | null }>;
  close(): void;
}

/** ~15s of 50ms frames — far past the point where a held button is a mistake. */
const MAX_PENDING = 300;

/**
 * Audio captured before the socket finishes its handshake must be QUEUED, not
 * dropped — that first half-second is usually where the question starts.
 *
 * Interim partials are not monotonic: Sarvam periodically replays a segment from
 * the beginning in a fast burst, and re-sends the same partial during silence. A
 * partial that is a character-prefix of what is already held is a replay, not
 * news, and must not be treated as the transcript changing. That filtering lives
 * in turn.ts, which is what consumes partials as model input; this client
 * reports every partial so the screen shows exactly what the recogniser said.
 */
export function openRealtimeStt(options: RealtimeSttOptions): RealtimeSttSession {
  const { language = 'auto', onPartial, onFinal, onError } = options;

  const params = new URLSearchParams({
    model: config.sarvam.sttModel,
    language_code: language,
    // 'fast' trades a little interim accuracy for partials that keep up with the
    // speaker. The FINAL transcript, which is what gets answered, is unaffected.
    stream_type: 'fast',
    endpointing: 'manual',
    encoding: 'linear16',
    sample_rate: '16000',
  });

  // The key rides in a handshake HEADER — which a browser WebSocket cannot set,
  // the structural reason this is proxied rather than opened from the page.
  const ws = new WebSocket(`${config.sarvam.realtimeUrl}?${params}`, {
    headers: { 'api-subscription-key': config.sarvam.apiKey },
  });

  const pending: string[] = [];
  let open = false;
  let ended = false;
  let lastPartial = '';
  let finalText = '';
  let finalLanguage: string | null = language === 'auto' ? null : language;
  let partialLanguage: string | null = null;
  let resolveFinal: (() => void) | null = null;

  const send = (obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  ws.on('open', () => {
    open = true;
    send({ event: 'speech_start' });
    for (const b64 of pending) send({ event: 'audio_input', audio: b64 });
    pending.length = 0;
    // Released before the handshake finished: close the utterance right away.
    if (ended) {
      send({ event: 'speech_end' });
      send({ event: 'flush' });
    }
  });

  ws.on('message', (raw) => {
    let msg: { event?: string; text?: string; language?: string; message?: string; is_fatal?: boolean };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.event) {
      case 'transcript.partial':
        if (msg.text) {
          lastPartial = msg.text;
          // With language_code=auto the partial carries the language detected
          // so far — the model may start before the final exists.
          if (msg.language) partialLanguage = normalizeDetected(msg.language);
          onPartial?.(msg.text, partialLanguage);
        }
        break;

      case 'transcript.final':
        if (msg.text) {
          // A long turn finalises in several utterances; the question is all of them.
          finalText = finalText ? `${finalText} ${msg.text}`.trim() : msg.text;
          if (msg.language) finalLanguage = normalizeDetected(msg.language);
          onFinal?.(finalText, finalLanguage);
        }
        if (ended) resolveFinal?.();
        break;

      case 'error':
        onError?.(msg.message ?? 'recognition error');
        if (msg.is_fatal) resolveFinal?.();
        break;

      default:
        // session.begin / session.end / vad.* / pong
        break;
    }
  });

  ws.on('error', (err) => {
    onError?.(err.message);
    resolveFinal?.();
  });

  ws.on('close', () => {
    open = false;
    resolveFinal?.();
  });

  return {
    sendAudio(b64) {
      if (ended) return;
      if (open) send({ event: 'audio_input', audio: b64 });
      else if (pending.length < MAX_PENDING) pending.push(b64);
    },

    /**
     * Falls back to the last interim result if the final never lands — a rough
     * transcript beats telling someone who just spoke that nothing was heard.
     */
    async finish() {
      if (!ended) {
        ended = true;
        if (open) {
          send({ event: 'speech_end' });
          send({ event: 'flush' });
        }
        if (!finalText && ws.readyState <= WebSocket.OPEN) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(done, config.sarvam.finalTimeoutMs);
            function done() {
              resolveFinal = null;
              clearTimeout(timer);
              resolve();
            }
            resolveFinal = done;
          });
        }
      }
      return {
        transcript: (finalText || lastPartial || '').trim(),
        language: finalLanguage,
      };
    },

    close() {
      ended = true;
      try {
        send({ event: 'end' });
        ws.close();
      } catch {
        /* best effort */
      }
    },
  };
}
