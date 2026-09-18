import { openRealtimeStt, RealtimeSttSession } from '../sarvam/stt.js';
import { openStreamingTts, StreamingTtsSession, SAMPLE_RATE, speakable } from '../sarvam/tts.js';
import { streamText } from '../bedrock/stream.js';
import { splitSentences } from '../sarvam/client.js';

export interface TurnOptions {
  readonly send: (message: Record<string, unknown>) => void;
  readonly fail: (message: string, code?: string) => void;
  readonly language: string;
  readonly history: { role: 'user' | 'assistant'; content: string }[];
  readonly known?: string | null;
  readonly onHeard?: (language: string) => void;
}

export interface Turn {
  sendAudio(base64Frame: string): void;
  finish(): Promise<void>;
  cancel(): void;
}

/**
 * One voice turn.
 *
 * Both vendor sockets (recognition and speech) are opened at BEGIN so their
 * handshakes overlap the question rather than following it.
 */
export function createTurn(options: TurnOptions): Turn {
  let isCancelled = false;
  let isFinished = false;
  const abortController = new AbortController();

  let sttSession: RealtimeSttSession | null = null;
  let ttsSession: StreamingTtsSession | null = null;
  let audioStarted = false;

  const targetLang = options.language || options.known || 'hi-IN';

  // 1. Open STT socket
  sttSession = openRealtimeStt({
    language: targetLang,
    onPartial: (text, lang) => {
      if (isCancelled) return;
      options.send({ t: 'partial', text });
      if (lang && options.onHeard) {
        options.onHeard(lang);
      }
    },
    onFinal: (text, lang) => {
      if (isCancelled) return;
      options.send({ t: 'final', text });
      if (lang && options.onHeard) {
        options.onHeard(lang);
      }
    },
    onError: (err) => {
      if (!isCancelled) {
        options.fail(err, 'STT_ERROR');
      }
    },
  });

  // 2. Open streaming TTS socket concurrently
  ttsSession = openStreamingTts({
    onAudio: (seq, base64Pcm) => {
      if (isCancelled) return;
      if (!audioStarted) {
        audioStarted = true;
        options.send({ t: 'audio_start', rate: SAMPLE_RATE });
      }
      options.send({ t: 'audio', seq, b64: base64Pcm });
    },
    onDone: () => {
      if (isCancelled) return;
      options.send({ t: 'audio_end' });
    },
    onError: (err) => {
      if (!isCancelled) {
        options.fail(err, 'TTS_ERROR');
      }
    },
  });

  return {
    sendAudio(base64Frame: string) {
      if (isCancelled || isFinished || !sttSession) return;
      sttSession.sendAudio(base64Frame);
    },

    async finish(): Promise<void> {
      if (isCancelled || isFinished || !sttSession || !ttsSession) return;
      isFinished = true;

      try {
        // Wait for final recognized transcript
        const { transcript, language } = await sttSession.finish();
        sttSession.close();

        const trimmed = transcript.trim();
        // Check if transcript has any letters
        if (!trimmed || !speakable(trimmed)) {
          options.send({ t: 'empty' });
          ttsSession.close();
          options.send({ t: 'done' });
          return;
        }

        options.send({ t: 'thinking' });

        const replyLanguage = language || targetLang;
        ttsSession.configure(replyLanguage);

        // Construct tutor prompt
        const systemPrompt = `You are a vocational AI tutor for India's blue-collar industrial maintenance technicians and electricians. Ground your answers in equipment standards and safety SOPs. Respond concisely and clearly in ${replyLanguage}. Always keep technical terms (e.g. hydraulic pump, solenoid valve, circuit breaker, LOTO) in English code-switching as spoken on the shop floor.`;

        const messages: { role: 'user' | 'assistant'; content: string }[] = [
          ...options.history.map((h) => ({
            role: h.role,
            content: h.content,
          })),
          { role: 'user', content: trimmed },
        ];

        let fullReply = '';
        let pendingText = '';

        for await (const delta of streamText(
          {
            system: systemPrompt,
            messages,
            maxTokens: 512,
          },
          abortController.signal
        )) {
          if (isCancelled) break;

          fullReply += delta;
          pendingText += delta;
          options.send({ t: 'delta', text: delta });

          // Split pending text on sentence boundaries (including Devanagari danda)
          const sentences = splitSentences(pendingText);
          if (sentences.length > 1) {
            // All sentences except the incomplete trailing one are complete
            for (let i = 0; i < sentences.length - 1; i++) {
              const sentence = sentences[i];
              if (speakable(sentence)) {
                ttsSession.sendText(sentence);
              }
            }
            pendingText = sentences[sentences.length - 1];
          }
        }

        // Flush remaining trailing clause if any
        if (!isCancelled && pendingText.trim() && speakable(pendingText)) {
          ttsSession.sendText(pendingText);
        }

        if (!isCancelled) {
          ttsSession.flush();
          options.send({ t: 'reply', text: fullReply });
          options.send({ t: 'done' });
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : 'Turn failed';
          options.fail(msg, 'TURN_ERROR');
        }
      }
    },

    cancel() {
      isCancelled = true;
      abortController.abort();
      if (sttSession) {
        sttSession.close();
      }
      if (ttsSession) {
        ttsSession.close();
      }
    },
  };
}
