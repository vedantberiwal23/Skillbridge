import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { keys, userPk, orgPk, prefixes } from '../shared/keys';

/**
 * Skill profiler worker (FEATURES.md §12, DATA-MODEL.md S1/S2/S3).
 *
 * Fully background: reached only via table stream → fanout → SQS, never from a
 * request path. It writes twice, as Decision 1 requires — the worker's own
 * `SKILLPROFILE#CURRENT`, and an atomic counter update to the materialized
 * department aggregate that the manager dashboard reads with one GetItem.
 */

const TABLE_NAME = process.env.TABLE_NAME ?? '';
const MODEL_ID = process.env.MODEL_ID ?? '';
const MAX_EVENTS = 200;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const bedrock = new BedrockRuntimeClient({});

interface ProfilingJob {
  userId: string;
  orgId: string;
  from: string;
  to: string;
  events: number;
}

interface SqsRecord {
  messageId: string;
  body: string;
}

interface SqsEvent {
  Records: SqsRecord[];
}

interface BatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

interface DerivedProfile {
  strengths: string[];
  weaknesses: string[];
  /** Weakness label -> weight, folded into the department's skillGaps map. */
  skillGaps: Record<string, number>;
}

const SYSTEM_PROMPT = [
  'You analyse a vocational trainee\'s recent activity in an industrial',
  'maintenance training platform (electrical, hydraulics, mechanical).',
  'From their tutor questions and in-app events, infer where they are strong and',
  'where they are struggling.',
  'Reply with ONLY a JSON object, no prose and no code fence, shaped exactly:',
  '{"strengths":["..."],"weaknesses":["..."],"skillGaps":{"topic-slug":1}}',
  'Use at most 5 strengths and 5 weaknesses. Keep each to a short noun phrase.',
  'skillGaps keys are lowercase hyphenated topic slugs drawn from the weaknesses,',
  'values are small positive integers weighting how strongly the evidence shows it.',
  'If the evidence is too thin to judge, return empty arrays and an empty object',
  'rather than inventing a finding.',
].join(' ');

/** `YYYY-MM`, matching the period `GET /api/aggregates` defaults to. */
function currentPeriod(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function parseModelJson(text: string): DerivedProfile {
  // Models sometimes wrap JSON in a fence despite instructions.
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('model returned no JSON object');

  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<DerivedProfile>;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 5) : [];

  const gaps: Record<string, number> = {};
  if (parsed.skillGaps && typeof parsed.skillGaps === 'object') {
    for (const [k, v] of Object.entries(parsed.skillGaps)) {
      const weight = Number(v);
      // Reject anything non-finite or non-positive: this value goes into an
      // ADD, and a NaN there corrupts the counter for the whole department.
      if (Number.isFinite(weight) && weight > 0) gaps[k] = Math.min(Math.round(weight), 10);
    }
  }

  return {
    strengths: strings(parsed.strengths),
    weaknesses: strings(parsed.weaknesses),
    skillGaps: gaps,
  };
}

async function deriveProfile(events: Record<string, unknown>[]): Promise<DerivedProfile> {
  const digest = events
    .map((e) => {
      const type = String(e.type ?? 'EVENT');
      const detail = [e.question, e.assessmentId, e.lessonId, e.transcript]
        .filter(Boolean)
        .join(' | ');
      return `- ${type}: ${detail}`.slice(0, 300);
    })
    .join('\n');

  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Recent activity:\n${digest}` }],
      }),
    })
  );

  const payload = JSON.parse(new TextDecoder().decode(res.body));
  const text = payload?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('unexpected Bedrock response shape');
  return parseModelJson(text);
}

/**
 * Update the department rollup.
 *
 * Two calls, deliberately. DynamoDB rejects `ADD skillGaps.#k` when the parent
 * map does not yet exist, and it rejects initialising the parent and adding to a
 * nested path in one expression ("Two document paths overlap"). So the first
 * call creates the item and the empty map idempotently, and the second does the
 * atomic increments. Both are `ADD`/`if_not_exists` — never read-then-write,
 * which would lose counts, since this Lambda consumes SQS batches concurrently.
 */
async function updateDeptAggregate(
  orgId: string,
  deptId: string,
  period: string,
  userId: string,
  skillGaps: Record<string, number>
): Promise<void> {
  const Key = keys.deptAggregate(orgId, deptId, period);

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key,
      UpdateExpression:
        'SET orgId = :orgId, deptId = :deptId, #period = :period, skillGaps = if_not_exists(skillGaps, :empty)',
      ExpressionAttributeNames: { '#period': 'period' },
      ExpressionAttributeValues: {
        ':orgId': orgId,
        ':deptId': deptId,
        ':period': period,
        ':empty': {},
      },
    })
  );

  // Counting DISTINCT workers: ADD on a string set is atomic, and ALL_OLD tells
  // us whether this worker was already counted. Incrementing workerCount
  // unconditionally would count the same worker once per profiling run.
  const seen = await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key,
      UpdateExpression: 'ADD seenWorkers :worker',
      ExpressionAttributeValues: { ':worker': new Set([userId]) },
      ReturnValues: 'ALL_OLD',
    })
  );

  const alreadyCounted = (seen.Attributes?.seenWorkers as Set<string> | undefined)?.has(userId);
  const gapEntries = Object.entries(skillGaps);

  if (!alreadyCounted || gapEntries.length > 0) {
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const adds: string[] = [];

    if (!alreadyCounted) {
      adds.push('workerCount :one');
      values[':one'] = 1;
    }
    gapEntries.forEach(([gap, weight], index) => {
      names[`#g${index}`] = gap;
      values[`:w${index}`] = weight;
      adds.push(`skillGaps.#g${index} :w${index}`);
    });

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key,
        UpdateExpression: `ADD ${adds.join(', ')}`,
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
      })
    );
  }
}

async function processJob(job: ProfilingJob): Promise<void> {
  // The job carries a userId, and a userId is never authorization on its own —
  // `USER#<id>` keys contain no tenant. Read the profile and check the claim.
  const profileRes = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: keys.profile(job.userId) })
  );
  const profile = profileRes.Item;
  if (!profile) {
    console.warn('no profile for user, skipping', job.userId);
    return;
  }
  if (profile.orgId !== job.orgId) {
    throw new Error('tenant mismatch between stream event and stored profile');
  }

  const eventsRes = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to',
      ExpressionAttributeValues: {
        ':pk': userPk(job.userId),
        // The ts in EVT#<ts>#<ulid> is ISO-8601 UTC, so this range is ordered.
        ':from': `${prefixes.event}${job.from}`,
        // BETWEEN is inclusive, and the newest event's sort key is
        // `EVT#<to>#<id>` — strictly greater than `EVT#<to>`. Bounding with a
        // trailing '~' (0x7E) takes it in: every id character we generate,
        // Crockford base32 or UUID hex, sorts below it, as does the '#'
        // separator (0x23).
        ':to': `${prefixes.event}${job.to}~`,
      },
      Limit: MAX_EVENTS,
      ScanIndexForward: false,
    })
  );

  const events = eventsRes.Items ?? [];
  if (events.length === 0) return;

  const derived = await deriveProfile(events);
  const updatedAt = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...keys.skillProfile(job.userId),
        userId: job.userId,
        // Set explicitly on every item written: ddb drops undefined silently,
        // and an item without it fails every isolation check downstream.
        orgId: job.orgId,
        updatedAt,
        strengths: derived.strengths,
        weaknesses: derived.weaknesses,
        eventsConsidered: events.length,
      },
    })
  );

  const deptId = (profile.deptId as string | null) ?? null;
  if (deptId) {
    await updateDeptAggregate(
      job.orgId,
      deptId,
      currentPeriod(new Date()),
      job.userId,
      derived.skillGaps
    );
  }
  // A worker with no department contributes no rollup. gsi1's DEPT#NONE sentinel
  // exists for the directory listing, not as an aggregate bucket — rolling
  // unassigned workers into a fake department would report a team that does not
  // exist.
}

export const handler = async (event: SqsEvent): Promise<BatchResponse> => {
  if (!TABLE_NAME) throw new Error('TABLE_NAME is not configured');
  if (!MODEL_ID) throw new Error('MODEL_ID is not configured');

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records ?? []) {
    try {
      await processJob(JSON.parse(record.body) as ProfilingJob);
    } catch (err) {
      // Fail just this message. It returns to the queue and, after
      // maxReceiveCount, lands in the DLQ rather than replaying the whole batch
      // into an async-tier model.
      console.error('profiling job failed', record.messageId, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
