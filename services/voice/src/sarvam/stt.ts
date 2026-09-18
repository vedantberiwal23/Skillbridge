import WebSocket from 'ws';
import { config } from '../config.js';

/**
 * Sarvam realtime speech-to-text — `saaras:v3-realtime`.
 *
 * Audio in: raw linear16 PCM, 16 kHz mono, base64 inside a JSON frame.
 * Text out: transcript.partial (interim) then transcript.final (per utterance).
 *
 * endpointing=manual: push-to-talk, so the turn start/end is explicitly controlled.
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

/**
 * Audio captured before the socket finishes its handshake must be QUEUED, not
 * dropped — that first half-second is usually where the question starts.
 *
 * Interim partials are not monotonic: Sarvam periodically replays a segment from
 * the beginning in a fast burst, and re-sends the same partial during silence. A
 * partial that is a character-prefix of what is already held is a replay, not
 * news, and must not be treated as the transcript changing.
 */
export function openRealtimeStt(options: RealtimeSttOptions): RealtimeSttSession {
  const lang = options.language ?? 'auto';
  const url = `${config.sarvam.realtimeUrl}?model=${encodeURIComponent(
    config.sarvam.sttModel
  )}&endpointing=manual&language_code=${encodeURIComponent(lang)}`;

  const ws = new WebSocket(url, {
    headers: {
      'api-subscription-key': config.sarvam.apiKey,
    },
  });

  let isOpen = false;
  let isClosed = false;
  const preHandshakeQueue: string[] = [];
  let heldTranscript = '';
  let finalTranscript = '';
  let detectedLanguage: string | null = null;
  let finishResolver: ((val: { transcript: string; language: string | null }) => void) | null = null;

  function flushQueue() {
    while (preHandshakeQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
      const frame = preHandshakeQueue.shift();
      if (frame) {
        ws.send(JSON.stringify({ audio: { data: frame } }));
      }
    }
  }

  ws.on('open', () => {
    isOpen = true;
    flushQueue();
  });

  ws.on('message', (raw: WebSocket.RawData) => {
    try {
      const data = JSON.parse(raw.toString('utf-8'));

      // Check for partial transcript
      if (
        data.type === 'transcript.partial' ||
        data.event === 'transcript.partial' ||
        (data.transcript && !data.is_final && data.type !== 'transcript.final')
      ) {
        const text = (data.transcript ?? data.text ?? '').trim();
        const currentLang = data.language_code ?? data.language ?? null;
        if (text) {
          // Replay detection: ignore if partial is a prefix of held text
          if (!heldTranscript.startsWith(text)) {
            heldTranscript = text;
            detectedLanguage = currentLang;
            options.onPartial?.(heldTranscript, detectedLanguage);
          }
        }
      }

      // Check for final transcript
      if (
        data.type === 'transcript.final' ||
        data.event === 'transcript.final' ||
        data.is_final === true
      ) {
        const text = (data.transcript ?? data.text ?? '').trim();
        const currentLang = data.language_code ?? data.language ?? null;
        if (text) {
          heldTranscript = text;
          finalTranscript = text;
          detectedLanguage = currentLang;
          options.onFinal?.(finalTranscript, detectedLanguage);
        }
      }
    } catch {
      // Ignore JSON parse errors from vendor socket
    }
  });

  ws.on('error', (err: Error) => {
    options.onError?.(err.message);
  });

  ws.on('close', () => {
    isClosed = true;
    if (finishResolver) {
      finishResolver({
        transcript: finalTranscript || heldTranscript,
        language: detectedLanguage,
      });
      finishResolver = null;
    }
  });

  return {
    sendAudio(base64Frame: string) {
      if (isClosed) return;

      if (!isOpen || ws.readyState !== WebSocket.OPEN) {
        preHandshakeQueue.push(base64Frame);
      } else {
        ws.send(JSON.stringify({ audio: { data: base64Frame } }));
      }
    },

    async finish(): Promise<{ transcript: string; language: string | null }> {
      if (isClosed) {
        return {
          transcript: finalTranscript || heldTranscript,
          language: detectedLanguage,
        };
      }

      return new Promise((resolve) => {
        finishResolver = resolve;

        // Signal endpointing / stop to Sarvam if open
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'stop' }));
          } catch {
            // Ignore send errors on close
          }
        }

        // Safety timeout in case vendor socket does not close immediately
        setTimeout(() => {
          if (finishResolver) {
            const res = finishResolver;
            finishResolver = null;
            res({
              transcript: finalTranscript || heldTranscript,
              language: detectedLanguage,
            });
            try {
              ws.close();
            } catch {
              // Ignore
            }
          }
        }, 1200);
      });
    },

    close() {
      isClosed = true;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {
        // Ignore
      }
    },
  };
}
