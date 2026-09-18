import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { prefixes } from '../shared/keys';

/**
 * Stream → fanout → queue → worker, step two (DATA-MODEL.md, FEATURES.md §12).
 *
 * This exists so that the profiler is *debounced*. Attaching the profiler
 * directly to the table stream would invoke an async-tier model once per event,
 * and a single worker generates many events per session. Here a batch collapses
 * to at most one message per user, so a burst of activity costs one profiling
 * run rather than one per keystroke.
 *
 * Filtering happens in code rather than in the event source mapping. An ESM
 * filter would be cheaper — it would stop non-`EVT#` writes invoking this
 * function at all — but the AWS docs currently disagree with each other about
 * what a DynamoDB filter may match (the Lambda guide says "only support
 * filtering on the `dynamodb` key", while the DynamoDB TTL guide demonstrates
 * filtering on `userIdentity`, which is outside it), and a filter that matches
 * nothing fails silently: the profiler would simply never run, with nothing in
 * any log to say so. Verify against a live event source mapping before moving
 * the filter out of this file.
 */

const QUEUE_URL = process.env.QUEUE_URL ?? '';

const sqs = new SQSClient({});

/** Only the fields of a stream record this handler actually relies on. */
interface StreamRecord {
  eventName?: string;
  eventID?: string;
  dynamodb?: {
    SequenceNumber?: string;
    Keys?: Record<string, { S?: string }>;
    NewImage?: Record<string, { S?: string }>;
  };
  /** Present, and set to the DynamoDB service, when TTL performed the delete. */
  userIdentity?: { type?: string; principalId?: string };
}

interface StreamEvent {
  Records: StreamRecord[];
}

/** Lambda's partial-batch-failure contract; needs ReportBatchItemFailures on the ESM. */
interface BatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

export interface ProfilingJob {
  userId: string;
  orgId: string;
  /** Oldest event in the batch for this user — the worker reads from here. */
  from: string;
  /** Newest event in the batch for this user. */
  to: string;
  events: number;
}

const USER_PK = 'USER#';

/**
 * `EVT#<ts>#<ulid>` — the timestamp is an ISO-8601 UTC string precisely so this
 * slice is ordered and range-queryable (DATA-MODEL.md S1).
 */
function timestampFromEventSk(sk: string): string | null {
  const rest = sk.slice(prefixes.event.length);
  const end = rest.indexOf('#');
  return end === -1 ? null : rest.slice(0, end);
}

export interface CollectedJobs {
  /** userId -> the single collapsed job for that worker. */
  jobs: Map<string, ProfilingJob>;
  /** userId -> stream sequence numbers folded into it, for failure reporting. */
  contributing: Map<string, string[]>;
}

/**
 * The filter and the debounce, separated from the I/O so it can be tested
 * directly. This is where a mistake would be silent — a record wrongly skipped
 * never profiles anyone, and nothing logs it.
 */
export function collectJobs(records: StreamRecord[]): CollectedJobs {
  // userId -> job, so a batch of many events for one worker becomes one message.
  const jobs = new Map<string, ProfilingJob>();
  // Every record folded into a job, so a send failure can fail exactly those.
  const contributing = new Map<string, string[]>();

  for (const record of records) {
    // A TTL expiry arrives as a REMOVE carrying userIdentity.principalId
    // 'dynamodb.amazonaws.com'. EVT# items are written once and never updated,
    // so INSERT alone excludes both TTL deletions and any later modification.
    if (record.eventName !== 'INSERT') continue;

    const keys = record.dynamodb?.Keys;
    const pk = keys?.PK?.S;
    const sk = keys?.SK?.S;
    if (!pk || !sk) continue;
    if (!sk.startsWith(prefixes.event)) continue;
    if (!pk.startsWith(USER_PK)) continue;

    const userId = pk.slice(USER_PK.length);
    // orgId is written on every item precisely so a downstream consumer never
    // has to infer the tenant. A record without it is malformed — skip it
    // rather than guessing, because guessing here crosses a tenant boundary.
    const orgId = record.dynamodb?.NewImage?.orgId?.S;
    if (!orgId) continue;

    const ts = timestampFromEventSk(sk);
    if (!ts) continue;

    const sequenceNumber = record.dynamodb?.SequenceNumber ?? record.eventID;
    const existing = jobs.get(userId);
    if (existing) {
      if (ts < existing.from) existing.from = ts;
      if (ts > existing.to) existing.to = ts;
      existing.events += 1;
    } else {
      jobs.set(userId, { userId, orgId, from: ts, to: ts, events: 1 });
    }
    if (sequenceNumber) {
      const list = contributing.get(userId) ?? [];
      list.push(sequenceNumber);
      contributing.set(userId, list);
    }
  }

  return { jobs, contributing };
}

export const handler = async (event: StreamEvent): Promise<BatchResponse> => {
  if (!QUEUE_URL) throw new Error('QUEUE_URL is not configured');

  const { jobs, contributing } = collectJobs(event.Records ?? []);

  if (jobs.size === 0) return { batchItemFailures: [] };

  const failures: { itemIdentifier: string }[] = [];
  const entries = [...jobs.values()];

  // SendMessageBatch caps at 10 entries per call.
  for (let i = 0; i < entries.length; i += 10) {
    const chunk = entries.slice(i, i + 10);
    try {
      const res = await sqs.send(
        new SendMessageBatchCommand({
          QueueUrl: QUEUE_URL,
          Entries: chunk.map((job, index) => ({
            Id: String(index),
            MessageBody: JSON.stringify(job),
          })),
        })
      );
      for (const failed of res.Failed ?? []) {
        const job = chunk[Number(failed.Id)];
        if (!job) continue;
        for (const seq of contributing.get(job.userId) ?? []) {
          failures.push({ itemIdentifier: seq });
        }
      }
    } catch (err) {
      console.error('SendMessageBatch failed for chunk', err);
      for (const job of chunk) {
        for (const seq of contributing.get(job.userId) ?? []) {
          failures.push({ itemIdentifier: seq });
        }
      }
    }
  }

  // Lambda checkpoints at the LOWEST sequence number returned and retries from
  // there, so returning the precise contributing records keeps the replay small.
  return { batchItemFailures: failures };
};
