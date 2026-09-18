import WebSocket from 'ws';
import { config } from '../config.js';

/**
 * Sarvam streaming text-to-speech — `bulbul:v3` over `/text-to-speech/ws`.
 *
 * Model deltas are piped in as they arrive so audio starts on the first sentence
 * rather than the last. Audio for one connection arrives IN ORDER, and the
 * `final` event fires once per flush — a reliable end-of-reply signal.
 *
 * TRAP, and it is severe: the streaming endpoint KILLS THE ENTIRE REPLY on a
 * text message it considers empty — and "empty" is broader than it looks. A lone
 * " ", "\n\n", ",", "." or "(" is rejected outright, and one such message loses
 * ALL of the reply's audio. Streaming models emit exactly these as deltas. So
 * only send text containing a letter or a combining mark; anything else rides
 * along with the word before it. Do not loosen this.
 *
 * Also: v3 caps one input at ~500 characters, rejects `pitch` and `loudness`
 * outright (only `pace` survives), and the v2 voices such as `anushka` now 400.
 */

/**
 * linear16 raw PCM, no RIFF header — the browser schedules it gaplessly through
 * Web Audio with no decoding step. Sent to the client in `audio_start`.
 */
export const SAMPLE_RATE = 22050;

/** True only if the text contains a letter or combining mark — see the trap above. */
export function speakable(text: string): boolean {
  return /[\p{L}\p{M}]/u.test(text);
}

export interface StreamingTtsOptions {
  readonly onAudio: (seq: number, base64Pcm: string) => void;
  readonly onDone: () => void;
  readonly onError: (message: string) => void;
  readonly speaker?: string;
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

/** Longest run held back waiting for a word to end. */
const MAX_HELD = 60;

/** The socket closes itself after 60s idle; a ping keeps a slow turn alive. */
const PING_MS = 25_000;

type Outgoing = { type: 'text'; data: { text: string } } | { type: 'flush' };

/**
 * Opened at BUTTON-DOWN so the ~200ms handshake overlaps the question, and
 * configured later, once the reply's language is known. Text that arrives
 * before the socket is open and configured is queued, never dropped.
 */
export function openStreamingTts(options: StreamingTtsOptions): StreamingTtsSession {
  const { onAudio, onDone, onError, speaker = config.sarvam.defaultSpeaker } = options;
  const model = config.sarvam.ttsModel;

  const ws = new WebSocket(`${config.sarvam.ttsStreamUrl}?model=${model}&send_completion_event=true`, {
    headers: { 'Api-Subscription-Key': config.sarvam.apiKey },
  });

  let open = false;
  let configured = false;
  let language: string | null = null;
  let failed = false;
  let finished = false;
  let seq = 0;
  let ping: NodeJS.Timeout | null = null;
  const pending: Outgoing[] = [];
  // Letterless text before the first real piece, and the latest real piece held
  // until we see what follows it — see sendText.
  let lead = '';
  let held = '';

  const raw = (obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  const drain = () => {
    if (!open || !configured) return;
    while (pending.length) raw(pending.shift());
  };

  const sendConfig = () => {
    raw({
      type: 'config',
      data: {
        language_code: language,
        speaker,
        model,
        pace: 1.0,
        speech_sample_rate: String(SAMPLE_RATE),
        output_audio_codec: 'linear16',
        // The smallest allowed: start after 30 characters rather than 50.
        min_buffer_size: 30,
        max_chunk_length: 150,
      },
    });
    configured = true;
    drain();
  };

  const fail = (message: string) => {
    if (failed || finished) return;
    failed = true;
    onError(message);
  };

  ws.on('open', () => {
    open = true;
    if (language) sendConfig();
    ping = setInterval(() => raw({ type: 'ping' }), PING_MS);
  });

  ws.on('message', (buf) => {
    let m: { type?: string; data?: { audio?: string; event_type?: string; message?: string } };
    try {
      m = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (m.type === 'audio' && m.data?.audio) {
      onAudio(seq++, m.data.audio);
    } else if (m.type === 'event' && m.data?.event_type === 'final') {
      finished = true;
      onDone();
    } else if (m.type === 'error') {
      fail(m.data?.message ?? 'speech synthesis failed');
    }
  });

  ws.on('error', (err) => fail(err.message));
  ws.on('close', () => {
    open = false;
    if (ping) clearInterval(ping);
    // Closed before the reply finished speaking is a failure, not an end.
    if (!finished) fail('speech stream closed early');
  });

  const emit = (t: string) => {
    const msg: Outgoing = { type: 'text', data: { text: t.replace(/\s*\n+\s*/g, ' ') } };
    if (open && configured) raw(msg);
    else pending.push(msg);
  };

  return {
    ok: () => !failed,
    language: () => language,

    /**
     * The protocol takes config ONCE per connection, so this is a no-op after the
     * first call — a caller that learns the language was wrong needs a new stream.
     */
    configure(code) {
      if (configured || language) return false;
      language = code;
      if (open) sendConfig();
      return true;
    },

    /*
     * A message is only sent if it contains a letter or a combining mark.
     * Anything else attaches to the piece BEFORE it — where punctuation belongs —
     * by holding the latest real piece back until the next one arrives.
     *
     * Whole words, not fragments: models split Indic text BELOW the syllable
     * ("त", "ु", "म्", "ही"), so a piece that neither starts with a space nor
     * follows one continues the word being held. MAX_HELD bounds the wait for
     * text with no spaces in it.
     */
    sendText(text) {
      if (failed || text == null) return;
      const piece = String(text);
      if (!speakable(piece)) {
        if (held) held += piece;
        else lead += piece;
        return;
      }
      const continuesWord = held && !/\s$/.test(held) && !/^\s/.test(piece);
      if (continuesWord && held.length < MAX_HELD) {
        held += piece;
        return;
      }
      if (held) emit(held);
      held = lead + piece;
      lead = '';
    },

    /** Once, when the model is done: speak whatever is still buffered. */
    flush() {
      if (held && !failed) emit(held);
      held = '';
      lead = '';
      if (failed) return;
      const msg: Outgoing = { type: 'flush' };
      if (open && configured) raw(msg);
      else pending.push(msg);
    },

    close() {
      finished = true;
      if (ping) clearInterval(ping);
      try {
        ws.close();
      } catch {
        /* best effort */
      }
    },
  };
}
