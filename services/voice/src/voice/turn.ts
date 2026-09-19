import { streamText as bedrockStream, ModelError, type StreamRequest } from '../bedrock/stream.js';
import { isLanguage, textToSpeech } from '../sarvam/client.js';
import { openRealtimeStt } from '../sarvam/stt.js';
import { openStreamingTts, SAMPLE_RATE, speakable } from '../sarvam/tts.js';
import { config } from '../config.js';
import type { Grounder } from './grounding.js';
import * as coach from './coach.js';

/**
 * One voice turn, arranged so that almost nothing waits on anything else.
 *
 * The naive shape — upload the clip, recognise it, think, synthesise, return —
 * is about seven seconds during which the screen cannot distinguish a working
 * mic from a broken one. Nothing here is faster than the APIs it calls; what
 * changes is that the stages OVERLAP and each reports as it lands:
 *
 *   speaking    recognition runs on live audio, words appear as they are said
 *   release     the transcript is already final — recognition costs ~0 extra
 *   thinking    the model streams, so the answer appears word by word
 *   sentence 1  synthesised while the model is still writing sentence 2
 *   audio       playback starts on sentence one, not on the last one
 *
 * Both vendor sockets (recognition and speech) are opened at BEGIN, so their
 * handshakes overlap the question rather than following it.
 */

export type StreamFn = (request: StreamRequest, signal?: AbortSignal) => AsyncIterable<string>;

export interface TurnOptions {
  readonly send: (message: Record<string, unknown>) => void;
  readonly fail: (message: string, code?: string) => void;
  readonly language: string;
  readonly history: { role: 'user' | 'assistant'; content: string }[];
  /** A language the worker is known to speak — picked explicitly, or heard last turn. */
  readonly known?: string | null;
  readonly onHeard?: (language: string) => void;
  /** The org's SOP retriever, bound to the VERIFIED orgId by channel.ts. */
  readonly ground?: Grounder;
  /** Label of the machine part the worker tapped before asking, if any. */
  readonly part?: string | null;
  /** Injected in tests; Bedrock otherwise. */
  readonly streamText?: StreamFn;
  /**
   * Called once per ANSWERED turn, immediately after the reply is sent.
   *
   * Identity and persistence are channel.ts's business: this module knows what
   * happened, not who it happened to, which keeps DynamoDB out of the turn loop
   * entirely and leaves tests writing nothing by simply not passing this.
   *
   * The implementation must return synchronously and must not throw — it is
   * called on the turn path, where a blocking write would cost latency on the
   * one path where latency is the product.
   */
  readonly record?: (turn: CompletedTurn) => void;
}

/** What a turn knows about itself once it has answered. Carries no audio. */
export interface CompletedTurn {
  readonly question: string;
  readonly heardLanguage: string | null;
  readonly spokenLanguage: string | null;
  readonly grounded: boolean;
  readonly part: string | null;
  readonly replyChars: number;
  /** Release to first audio out, in ms; null when the turn produced no speech. */
  readonly latencyMs: number | null;
}

export interface Turn {
  sendAudio(base64Frame: string): void;
  finish(): Promise<void>;
  cancel(): void;
}

/** How still the interim transcript must be, button still down, before speculating. */
const SPEC_STABLE_MS = Number(process.env.VOICE_SPEC_STABLE_MS ?? 250);
/** A two-word fragment is never the question. */
const SPEC_MIN_WORDS = 3;
/** Model starts per turn INCLUDING the one at release — the ceiling on wasted calls. */
const SPEC_MAX = 3;
const SPECULATE = process.env.VOICE_SPECULATE !== '0';

/**
 * Waiting for speech to finish: Sarvam's own end-of-reply event, giving up only
 * if audio stops arriving for TTS_IDLE_MS. A flat timeout cut long answers off.
 */
const TTS_IDLE_MS = 10_000;
const TTS_MAX_MS = 120_000;

/**
 * Deliberately below the slowest measured bulbul:v3 rate (Bengali 12.5 chars/s),
 * so a mid-reply resume lands BEFORE where speech stopped: it may repeat part of
 * a sentence, but can never skip one.
 */
const SPOKEN_CHARS_PER_SEC = 11;

const DEBUG_TIMING = process.env.VOICE_DEBUG_TIMING === '1';

/** Case, punctuation and spacing differ between partials of the SAME words. */
const norm = (s: string) =>
  String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * A partial that is a (character) prefix of what we already hold is a replay,
 * not news. saaras:v3-realtime replays whole segments in ~14ms bursts and
 * re-sends the same partial through silence; treating those as changes kept
 * resetting the speculation timer and started the model on two-word fragments.
 * Characters, not words: "Muj" must count as a prefix of "Mujhe".
 */
export const isReplayOf = (candidate: string, held: string): boolean => {
  const c = norm(candidate);
  return c.length > 0 && norm(held).startsWith(c);
};

/* ── a model call whose output can be held back ──────────────────────────────
   Tokens are buffered from the moment the call starts. A subscriber gets the
   backlog replayed and then the live stream — which is what lets a generation
   begun before release be ADOPTED at release without losing what it produced.
   Nothing speculative is shown or spoken until it is adopted.
   ────────────────────────────────────────────────────────────────────────────*/
interface Generation {
  readonly input: string;
  readonly spoken: string | null;
  readonly tokens: string[];
  readonly startedAt: number;
  firstTokenAt: number | null;
  /** True once the org's SOPs were found and put in the prompt. */
  grounded: boolean;
  done: boolean;
  error: unknown;
  abort(): void;
  subscribe(onToken: (t: string) => void, onDone: (err: unknown) => void): void;
  unsubscribe(onToken: (t: string) => void, onDone: (err: unknown) => void): void;
}

function startGeneration(opts: {
  input: string;
  spoken: string | null;
  history: TurnOptions['history'];
  part: string | null;
  ground?: Grounder;
  stream: StreamFn;
}): Generation {
  const ac = new AbortController();
  let aborted = false;
  let listeners: ((t: string) => void)[] = [];
  let doneListeners: ((err: unknown) => void)[] = [];

  const gen: Generation = {
    input: opts.input,
    spoken: opts.spoken,
    tokens: [],
    startedAt: Date.now(),
    firstTokenAt: null,
    grounded: false,
    done: false,
    error: null,
    abort() {
      if (gen.done || aborted) return;
      aborted = true;
      ac.abort();
    },
    subscribe(onToken, onDone) {
      for (const t of gen.tokens) onToken(t);
      if (gen.done) return onDone(gen.error);
      listeners.push(onToken);
      doneListeners.push(onDone);
    },
    unsubscribe(onToken, onDone) {
      listeners = listeners.filter((f) => f !== onToken);
      doneListeners = doneListeners.filter((f) => f !== onDone);
    },
  };

  void (async () => {
    try {
      const query = opts.part ? `${opts.part}: ${opts.input}` : opts.input;
      const sources = opts.ground ? await opts.ground(query) : null;
      if (aborted) return;
      gen.grounded = Boolean(sources);
      // Verbatim, in whatever language and script it arrived in — never
      // pre-translated. The part the worker tapped rides along as context.
      const asked = opts.part ? `[The worker tapped this part on the machine model: ${opts.part}]\n${opts.input}` : opts.input;
      const stream = opts.stream(
        {
          system: coach.systemFor({ spoken: opts.spoken, sources }),
          messages: coach.messagesFrom(opts.history, asked),
          maxTokens: coach.MAX_TOKENS,
        },
        ac.signal
      );
      for await (const text of stream) {
        if (aborted) break;
        gen.firstTokenAt ??= Date.now();
        gen.tokens.push(text);
        for (const fn of listeners) fn(text);
      }
    } catch (e) {
      if (!aborted) gen.error = e;
    } finally {
      gen.done = true;
      for (const fn of doneListeners) fn(gen.error);
    }
  })();

  return gen;
}

/** Tapped-part labels come from the client; they are context, so clamp them hard. */
const cleanPart = (p: unknown): string | null => {
  if (typeof p !== 'string') return null;
  const s = p.replace(/[\p{Cc}\[\]<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return s || null;
};

/**
 * Notes that matter when implementing this:
 *
 * - Speculation: people pause before releasing the button. If the interim
 *   transcript holds still while the button is still down, start the model then
 *   and buffer its tokens; adopt that generation at release if the words still
 *   match. Nothing speculative is ever shown or spoken — a wrong guess costs a
 *   wasted request, never a wrong answer.
 * - Do not wait for the final transcript before starting the model; the final
 *   lands before the first token anyway, so reconciling it is free.
 * - Per-sentence TTS finishes OUT OF ORDER. Every piece carries an index and the
 *   client plays strictly in index order.
 * - Silence is not a question. A silent mic can "transcribe" as punctuation with
 *   a confidently detected language; if the transcript has no letters at all,
 *   answer nothing and say so.
 * - Check the answer's script on its first few words: a model told "Telugu" has
 *   been observed replying in Hinglish. A wrong script is replaced by exactly one
 *   restart, never a loop.
 */
export function createTurn(options: TurnOptions): Turn {
  const { send, fail, history, known = null, onHeard, ground, record } = options;
  const stream = options.streamText ?? bedrockStream;
  const part = cleanPart(options.part);
  const fallbackLanguage = isLanguage(options.language) ? options.language : 'hi-IN';

  const tBegin = Date.now();
  let tRelease = 0;
  const marks: Record<string, unknown> = {};
  const mark = (name: string, at = Date.now()) => {
    if (DEBUG_TIMING) marks[name] = at - tRelease;
  };

  let partial: { text: string; language: string | null } = { text: '', language: null };
  let spec: Generation | null = null;
  let specCount = 0;
  let stableTimer: NodeJS.Timeout | undefined;
  let released = false;
  let cancelled = false;

  const generate = (input: string, spoken: string | null) =>
    startGeneration({ input, spoken, history, part, ground, stream });

  /* ── speculation, while the button is still held ── */
  const considerSpeculating = () => {
    if (!SPECULATE || released || cancelled) return;
    if (coach.wordCount(partial.text) < SPEC_MIN_WORDS) return;
    if (spec && norm(spec.input) === norm(partial.text)) return;
    // keep one start in reserve for release
    if (specCount >= SPEC_MAX - 1) return;
    spec?.abort();
    spec = generate(partial.text, known);
    specCount++;
  };

  const stt = openRealtimeStt({
    language: 'auto',
    onPartial: (text, lang) => {
      // The screen shows exactly what the recogniser just said, replays
      // included. Only the model's input is protected from them.
      send({ t: 'partial', text });
      if (isReplayOf(text, partial.text)) {
        if (DEBUG_TIMING) marks.partial_replays = ((marks.partial_replays as number) ?? 0) + 1;
        return;
      }
      partial = { text, language: lang ?? partial.language };
      if (released) return;
      // New words make an older speculation wrong; stop it spending tokens.
      if (spec && !isReplayOf(spec.input, text)) {
        spec.abort();
        spec = null;
      }
      // The clock restarts only when the transcript genuinely moved.
      clearTimeout(stableTimer);
      stableTimer = setTimeout(considerSpeculating, SPEC_STABLE_MS);
    },
    onFinal: (text, lang) => send({ t: 'final', text, language: lang }),
    onError: (message) => fail(message, 'STT'),
  });

  /* ── speech out: opened NOW so the handshake overlaps the question ── */
  let seq = 0;
  let firstAudioAt: number | null = null;
  let lastAudioAt = 0;
  let audioBytes = 0;
  let ttsFailed = false;
  let onStreamFailure: (() => void) | null = null;
  let resolveTts!: () => void;
  const ttsDone = new Promise<void>((r) => (resolveTts = r));
  const tts = openStreamingTts({
    onAudio: (_s, b64) => {
      if (cancelled) return;
      lastAudioAt = Date.now();
      audioBytes += Math.floor((b64.length * 3) / 4);
      if (firstAudioAt === null) {
        firstAudioAt = lastAudioAt;
        mark('audio_first', firstAudioAt);
      }
      // seq is monotonic per turn; the client plays strictly in seq order.
      send({ t: 'audio', seq: seq++, b64 });
    },
    onDone: () => resolveTts(),
    onError: (message) => {
      ttsFailed = true;
      console.warn('[voice/turn] speech stream failed:', message);
      onStreamFailure?.();
      resolveTts();
    },
  });

  const cleanup = () => {
    clearTimeout(stableTimer);
    spec?.abort();
    stt.close();
    tts.close();
  };

  return {
    sendAudio: (b64) => stt.sendAudio(b64),

    cancel() {
      cancelled = true;
      cleanup();
    },

    async finish() {
      released = true;
      tRelease = Date.now();
      clearTimeout(stableTimer);
      if (DEBUG_TIMING) marks.held_ms = tRelease - tBegin;

      const last = { ...partial };

      // Adopt a speculation made on the words that are still current.
      let gen: Generation | null = spec && norm(spec.input) === norm(last.text) ? spec : null;
      if (spec && !gen) spec.abort();
      spec = null;
      if (DEBUG_TIMING) marks.spec_adopted = Boolean(gen);

      // Nothing worth keeping — start on the last partial NOW rather than
      // waiting for recognition to close.
      if (!gen && coach.wordCount(last.text) >= 1) {
        gen = generate(last.text, known);
        specCount++;
      }

      const heard = await stt.finish();
      mark('transcript_final');
      stt.close();
      if (cancelled) {
        gen?.abort();
        return;
      }

      const transcript = (heard.transcript || last.text || '').trim();
      // Silence is not a question. A silent mic has "transcribed" as a string of
      // quote marks with a confidently detected language. No model, no TTS.
      if (!/\p{L}/u.test(transcript)) {
        gen?.abort();
        tts.close();
        send({ t: 'empty', note: 'no words were heard — check the microphone' });
        return;
      }

      const replyLanguage =
        heard.language && isLanguage(heard.language)
          ? heard.language
          : partial.language && isLanguage(partial.language)
            ? partial.language
            : fallbackLanguage;
      send({ t: 'final', text: transcript, language: replyLanguage });
      if (heard.language && isLanguage(heard.language)) onHeard?.(heard.language);

      // The final is authoritative. From it the language is KNOWN, so a restart
      // is told it rather than left to infer it.
      let restarted = false;
      if (!gen || coach.needsRestart(gen, transcript, replyLanguage)) {
        gen?.abort();
        gen = generate(transcript, replyLanguage);
        restarted = true;
      }

      /* ── the answer must be in the language that was HEARD ──────────────────
         Checked on the first few words, before any of it reaches the screen or
         the speaker. A wrong one is replaced by ONE restart from the final, told
         the language — never a loop: a restarted generation is never re-checked. */
      if (!restarted) {
        const current = gen;
        const agrees = coach.sameQuestion(current.input, transcript);
        const judge = (t: string, done: boolean) =>
          coach.looksDegenerate(t, { done })
            ? 'degenerate'
            : !agrees && !coach.mentionsAny(t, transcript)
              ? 'off_topic'
              : 'right';
        const verdict = await new Promise<string>((resolve) => {
          let text = '';
          let settled = false;
          const settle = (v: string) => {
            if (settled) return;
            settled = true;
            current.unsubscribe(onTok, onEnd);
            resolve(v);
          };
          function onTok(tok: string) {
            text += tok;
            const v = coach.scriptFits(text, replyLanguage);
            if (v === 'wrong') return settle('wrong');
            if (v === 'right' && coach.wordsOf(text).length >= 12) settle(judge(text, false));
          }
          function onEnd() {
            if (coach.scriptFits(text, replyLanguage) === 'wrong') return settle('wrong');
            settle(judge(text, true));
          }
          current.subscribe(onTok, onEnd);
        });
        if (DEBUG_TIMING) marks.script = verdict;
        // An error is not a verdict on the script; let it surface below.
        if (verdict !== 'right' && !current.error) {
          current.abort();
          gen = generate(transcript, replyLanguage);
          restarted = true;
        }
      }
      if (DEBUG_TIMING) marks.restarted = restarted;
      send({ t: 'thinking' });

      /* ── the voice, with a way out ────────────────────────────────────────────
         Text goes to the speech stream. If it dies BEFORE any audio was heard,
         everything fed so far is re-voiced sentence by sentence through batch
         synthesis (`say`, indexed — clips finish out of order and the client
         plays them by index). If it dies MID-reply, estimate how far the voice
         got, step back to that sentence's start, and continue from there.
         ──────────────────────────────────────────────────────────────────────*/
      let restMode = !tts.ok();
      let fed = '';
      let restBuf = '';
      let restIndex = 0;
      const restJobs: Promise<void>[] = [];
      const restDispatch = (sentence: string) => {
        const i = restIndex++;
        restJobs.push(
          (async () => {
            let audio: string | null = null;
            try {
              audio = await textToSpeech(sentence, { language: coach.languageOfText(sentence, replyLanguage) });
            } catch (e) {
              console.warn('[voice/turn] clip synthesis failed:', (e as Error).message);
            }
            if (audio && firstAudioAt === null) {
              firstAudioAt = Date.now();
              mark('audio_first', firstAudioAt);
            }
            if (!cancelled) send({ t: 'say', i, text: sentence, audio });
          })()
        );
      };
      const toRest = (text: string) => {
        restBuf += text;
        const { sentences, rest } = coach.cutSentences(restBuf);
        restBuf = rest;
        sentences.forEach(restDispatch);
      };
      const flushRest = () => {
        // a leftover with no letters (a stray ",") would 400 the clip request too
        if (speakable(restBuf)) restDispatch(restBuf.trim());
        restBuf = '';
      };
      onStreamFailure = () => {
        if (restMode) return;
        restMode = true;
        if (seq === 0) {
          toRest(fed);
          return;
        }
        const saidChars = Math.floor((audioBytes / (SAMPLE_RATE * 2)) * SPOKEN_CHARS_PER_SEC);
        const resumeAt = coach.sentenceStartBefore(fed, saidChars);
        console.warn(`[voice/turn] speech stream died mid-reply; resuming from char ${resumeAt} of ${fed.length}`);
        toRest(fed.slice(resumeAt));
      };

      if (restMode) tts.close();
      else send({ t: 'audio_start', rate: SAMPLE_RATE, encoding: 'pcm16' });

      // Tokens go straight to the screen AND the voice. The voice's language is
      // set the moment the script is unambiguous — well before the 30 characters
      // the speech engine needs to start.
      let held = '';
      let written = '';
      let spokenLanguage = replyLanguage;
      const toVoice = (text: string) => {
        if (restMode) return toRest(text);
        fed += text;
        tts.sendText(text);
      };
      const setVoice = (text: string) => {
        spokenLanguage = coach.languageOfText(text, replyLanguage);
        if (!restMode) tts.configure(spokenLanguage);
      };
      const toSpeech = (text: string) => {
        if (restMode || tts.language()) return toVoice(text);
        held += text;
        if (!coach.scriptKnown(held)) return;
        setVoice(held);
        toVoice(held);
        held = '';
      };

      const answer = gen;
      let looped = false;
      await new Promise<void>((resolve) =>
        answer.subscribe(
          (token) => {
            if (looped || cancelled) return;
            // A loop that starts after the check window is cut where it starts.
            if (/\s/.test(token) && coach.repeatsItself(coach.wordsOf(written + token).slice(-15))) {
              looped = true;
              answer.abort();
              return;
            }
            written += token;
            send({ t: 'delta', text: token });
            toSpeech(token);
          },
          () => {
            // A reply too short to reveal its script is spoken as-is.
            if (held) {
              setVoice(held);
              toVoice(held);
              held = '';
            }
            if (restMode) flushRest();
            else tts.flush();
            resolve();
          }
        )
      );
      if (DEBUG_TIMING && answer.firstTokenAt) marks.model_first_token = answer.firstTokenAt - tRelease;

      if (answer.error) {
        tts.close();
        throw answer.error instanceof ModelError ? answer.error : new ModelError(String(answer.error), 'UPSTREAM');
      }
      mark('model_done');

      if (!restMode) {
        const outcome = await new Promise<string>((resolve) => {
          const began = Date.now();
          let timer: NodeJS.Timeout | undefined;
          const tick = () => {
            if (restMode) return resolve('rest');
            const quiet = Date.now() - Math.max(lastAudioAt, began);
            if (quiet >= TTS_IDLE_MS || Date.now() - began >= TTS_MAX_MS) return resolve('stalled');
            timer = setTimeout(tick, 250);
          };
          void ttsDone.then(() => {
            clearTimeout(timer);
            resolve(restMode ? 'rest' : ttsFailed ? 'failed' : 'done');
          });
          tick();
        });
        if (DEBUG_TIMING) marks.tts_outcome = outcome;
        if (outcome === 'stalled') console.warn('[voice/turn] speech stream went quiet before its end event');
        if (outcome === 'done' || outcome === 'stalled') send({ t: 'audio_end' });
      }

      // The clip path — used from the start, or switched to mid-reply.
      if (restMode) {
        flushRest();
        await Promise.all(restJobs);
      }
      tts.close();

      if (DEBUG_TIMING) console.log('[voice timing] ms from release:', JSON.stringify(marks));

      const replyText = written.trim();

      send({
        t: 'reply',
        transcript,
        heard_language: replyLanguage,
        text: replyText,
        language: spokenLanguage,
        grounded: answer.grounded,
        engines: {
          stt: `sarvam:${config.sarvam.sttModel}`,
          reply: `bedrock:${config.bedrock.modelId}`,
          tts: `sarvam:${config.sarvam.ttsModel}${restMode ? '' : ':stream'}`,
        },
      });

      // After the reply is on the wire, never before: the worker hears the
      // answer first and telemetry is strictly downstream of that. The callback
      // hands off without awaiting, so this costs the turn nothing.
      record?.({
        question: transcript,
        heardLanguage: replyLanguage,
        spokenLanguage,
        grounded: answer.grounded,
        part,
        replyChars: replyText.length,
        latencyMs: firstAudioAt === null ? null : firstAudioAt - tRelease,
      });
    },
  };
}
