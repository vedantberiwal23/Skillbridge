import WebSocket from 'ws';
import { config } from '../config.js';

/**
 * Sarvam streaming text-to-speech — `bulbul:v3` over `/text-to-speech/ws`.
 *
 * Model deltas are piped in as they arrive so audio starts on the first sentence
 * rather than the last.
 *
 * TRAP: the streaming endpoint KILLS THE ENTIRE REPLY on a text message it considers
 * empty. A lone " ", "\n\n", ",", "." or "(" is rejected outright, losing all audio.
 * speakable(text) must guard every single sendText invocation. Any unspeakable text
 * is accumulated in a pending buffer and merged with the next speakable chunk.
 */

export const SAMPLE_RATE = 22050;

/** True only if the text contains a letter or combining mark. */
export function speakable(text: string): boolean {
  return /[\p{L}\p{M}]/u.test(text);
}

export interface StreamingTtsOptions {
  readonly onAudio: (seq: number, base64Pcm: string) => void;
  readonly onDone: () => void;
  readonly onError: (message: string) => void;
  readonly speaker?: string;
  readonly pace?: number;
}

export interface StreamingTtsSession {
  /** Set the voice's language once the reply's script is unambiguous. */
  configure(language: string): boolean;
  language(): string | null;
  sendText(text: string): void;
  flush(): void;
  ok(): boolean;
  close(): void;
}

export function openStreamingTts(options: StreamingTtsOptions): StreamingTtsSession {
  const wsUrl = `${config.sarvam.baseUrl.replace(/^http/, 'ws')}/text-to-speech/ws`;

  let ws: WebSocket | null = null;
  let isOpen = false;
  let isClosed = false;
  let selectedLanguage: string | null = null;
  let currentSeq = 0;
  let unsentBuffer = '';
  const preHandshakeTextQueue: string[] = [];

  function connect() {
    ws = new WebSocket(wsUrl, {
      headers: {
        'api-subscription-key': config.sarvam.apiKey,
      },
    });

    ws.on('open', () => {
      isOpen = true;
      // Send initial configuration if language was already configured
      if (selectedLanguage) {
        sendConfigMessage();
      }
      // Flush any queued text
      while (preHandshakeTextQueue.length > 0 && ws?.readyState === WebSocket.OPEN) {
        const text = preHandshakeTextQueue.shift();
        if (text) {
          sendPayload(text);
        }
      }
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const data = JSON.parse(raw.toString('utf-8'));

        if (data.audio || data.data?.audio) {
          const base64Audio = data.audio || data.data.audio;
          options.onAudio(currentSeq++, base64Audio);
        }

        if (data.type === 'done' || data.event === 'done' || data.is_final) {
          options.onDone();
        }
      } catch {
        // Ignore parse errors from vendor ping/pong
      }
    });

    ws.on('error', (err: Error) => {
      options.onError(err.message);
    });

    ws.on('close', () => {
      isClosed = true;
      isOpen = false;
    });
  }

  function sendConfigMessage() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !selectedLanguage) return;

    ws.send(
      JSON.stringify({
        type: 'config',
        model: config.sarvam.ttsModel,
        language_code: selectedLanguage,
        speaker: options.speaker ?? config.sarvam.defaultSpeaker,
        pace: options.pace ?? 1.0,
      })
    );
  }

  function sendPayload(text: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Cap single input chunk at ~500 characters
    const chunks = text.match(/.{1,480}/gs) || [text];
    for (const chunk of chunks) {
      ws.send(
        JSON.stringify({
          type: 'text',
          text: chunk,
        })
      );
    }
  }

  // Connect socket immediately so handshake overlaps speech
  connect();

  return {
    configure(language: string): boolean {
      selectedLanguage = language;
      if (isOpen && ws?.readyState === WebSocket.OPEN) {
        sendConfigMessage();
      }
      return true;
    },

    language(): string | null {
      return selectedLanguage;
    },

    sendText(text: string) {
      if (isClosed) return;

      // Accumulate with pending unsent fragments (e.g. leading punctuation/whitespace)
      const combined = unsentBuffer + text;

      if (!speakable(combined)) {
        // Does not contain letters or combining marks — hold for the next word
        unsentBuffer = combined;
        return;
      }

      // Valid speakable text
      unsentBuffer = '';
      if (!isOpen || ws?.readyState !== WebSocket.OPEN) {
        preHandshakeTextQueue.push(combined);
      } else {
        sendPayload(combined);
      }
    },

    flush() {
      // If remaining buffer is speakable, send it; otherwise drop lone trailing symbols
      if (unsentBuffer && speakable(unsentBuffer)) {
        this.sendText('');
      }
      unsentBuffer = '';

      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'flush' }));
        } catch {
          // Ignore
        }
      }
    },

    ok(): boolean {
      return !isClosed && (isOpen || ws?.readyState === WebSocket.CONNECTING);
    },

    close() {
      isClosed = true;
      unsentBuffer = '';
      preHandshakeTextQueue.length = 0;
      try {
        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {
        // Ignore
      }
    },
  };
}
