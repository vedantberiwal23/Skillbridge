import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';
import { keys, eventTtl } from './keys.js';

/**
 * What the voice loop leaves behind: one `EVT#` per answered question, one
 * `SESSION#` per channel.
 *
 * ## Why this exists
 *
 * `EVT#` items are the ONLY input to the profiler chain — table stream →
 * `EventStreamFanout` (which filters on the `EVT#` sort-key prefix) →
 * `SkillProfilerQueue` → `SkillProfilerWorker` → `AGG#DEPT#…`. Without a voice
 * event the profiler never sees what workers actually ask about, so
 * `DeptAggregate.skillGaps` on the manager dashboard reflects only assessment
 * attempts. The questions a worker asks out loud, mid-job, are the richest skill
 * signal the platform has; dropping them was the whole gap.
 *
 * ## Fire and forget, always
 *
 * Nothing here is awaited by a caller and nothing here throws. Every function
 * returns `void`, not a promise, so `await` is not merely discouraged at the
 * call site — it is unavailable. A voice turn must never block a frame on a
 * DynamoDB round trip, and a failed write costs a profiling signal, never a
 * dropped answer.
 *
 * ## Which role
 *
 * These writes go out under the App Runner **service** role (`voiceServiceRole`,
 * read/write). Not `VoiceOrchestratorRole` — that is assumed by
 * `bedrock.amazonaws.com`, is `grantReadData` only, and would fail a PutItem
 * with AccessDenied. That read-only grant is the enforcement of the "never on
 * the request path" rule, so it stays as it is.
 *
 * ## What is never written
 *
 * Raw audio. Not here, not to S3, not to a disk buffer outliving the turn.
 * Transcripts and turn metadata only.
 */

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }), {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * ISO-8601 UTC, which `toISOString` is by definition: fixed width and always
 * `Z`-suffixed, so it sorts lexicographically.
 *
 * That is load-bearing rather than cosmetic. The profiler's only read is
 * `SK between EVT#<from> and EVT#<to>`, and the fanout recovers each event's
 * timestamp by slicing it back out of the sort key. A local-time or
 * variable-width stamp would range-query wrongly with nothing to log.
 */
const nowIso = () => new Date().toISOString();

/** Keeps one bad question from writing a multi-megabyte item. */
const MAX_QUESTION_CHARS = 1000;

/** Never let a telemetry failure surface as a turn failure. */
function put(item: Record<string, unknown>, what: string): void {
  void ddb
    .send(new PutCommand({ TableName: config.tableName, Item: item }))
    .catch((e: unknown) => {
      console.warn(`[voice/telemetry] ${what} write failed:`, (e as Error).message);
    });
}

export interface TurnRecord {
  readonly userId: string;
  /** From the verified token. Written explicitly — see the note on the item below. */
  readonly orgId: string;
  readonly sessionId: string;
  /** The worker's question, as transcribed. */
  readonly question: string;
  readonly heardLanguage: string | null;
  readonly spokenLanguage: string | null;
  /** Whether the org's Knowledge Base contributed to the answer. */
  readonly grounded: boolean;
  /** Hotspot label, when the question followed a tap on the 3D model. */
  readonly part: string | null;
  readonly replyChars: number;
  /** Release to first audio out, in ms. Null when the turn produced no speech. */
  readonly latencyMs: number | null;
}

/**
 * One answered question.
 *
 * The attribute names are the profiler's contract, not free choice:
 * `infra/lambda/skill-profiler/index.ts` builds its digest from `type` plus the
 * first of `[question, assessmentId, lessonId, transcript]` that is present.
 * `question` is set and `transcript` deliberately is not — they hold the same
 * string here, and setting both would enter it into the digest twice.
 *
 * Unanswered turns are not recorded. A transcript with no letters in it is not a
 * question, carries no skill signal, and would only add a blank line to the
 * digest; the session's turn count still counts it.
 */
export function eventItem(turn: TurnRecord, ts = nowIso(), id = randomUUID()) {
  return {
      ...keys.event(turn.userId, ts, id),
      userId: turn.userId,
      // Explicit, on every item. `removeUndefinedValues` would drop it silently,
      // and `collectJobs` skips any stream record without one rather than
      // guessing the tenant — so a missing orgId here means this worker is never
      // profiled, with nothing in any log to say why.
      orgId: turn.orgId,
      type: 'VOICE_QUERY',
      sessionId: turn.sessionId,
      question: turn.question.slice(0, MAX_QUESTION_CHARS),
      heardLanguage: turn.heardLanguage,
      spokenLanguage: turn.spokenLanguage,
      grounded: turn.grounded,
      part: turn.part,
      replyChars: turn.replyChars,
      latencyMs: turn.latencyMs,
      at: ts,
      // Spelled exactly `ttl`, in epoch seconds, from `eventTtl()` called with no
      // argument. The table's timeToLiveAttribute is 'ttl' and any other name is
      // silently ignored, which would make raw events a permanent record.
      ttl: eventTtl(),
  };
}

export function recordTurn(turn: TurnRecord): void {
  put(eventItem(turn), 'event');
}

export interface SessionRecord {
  readonly userId: string;
  readonly orgId: string;
  readonly sessionId: string;
  /** Channel open, ISO-8601 UTC. This is the `<ts>` in the sort key. */
  readonly startedAt: string;
  /** Turns opened, including ones that turned out to be silence. */
  readonly turns: number;
  /** Turns that reached an answer. */
  readonly answered: number;
  /** Distinct languages spoken on this channel. */
  readonly languages: readonly string[];
}

/**
 * One channel, written once as it closes.
 *
 * Deliberately carries no `ttl`. DATA-MODEL puts the 90-day expiry on `EVT#`
 * items specifically — session history is a durable record of who used the
 * product and is not profiler input, so it is not swept.
 *
 * The sort key embeds `startedAt` rather than the close time so sessions list in
 * the order they began.
 */
export function sessionItem(session: SessionRecord, endedAt = nowIso()) {
  return {
    ...keys.session(session.userId, session.startedAt, session.sessionId),
    userId: session.userId,
    orgId: session.orgId,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    endedAt,
    turns: session.turns,
    answered: session.answered,
    languages: [...session.languages],
  };
}

export function recordSession(session: SessionRecord): void {
  put(sessionItem(session), 'session');
}
