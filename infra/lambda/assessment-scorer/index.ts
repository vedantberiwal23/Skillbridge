import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { keys } from '../shared/keys';

/**
 * Assessment scorer (FEATURES.md §13).
 *
 * Async tier, queue-driven. `POST /api/assessments` writes the attempt with
 * `status: 'pending'` and no score, enqueues, and returns — the worker never
 * holds a request open, and the client re-fetches for the result.
 *
 * Scoring is on the reasoning path, not only the final answer. The three kinds
 * in `AssessmentKind` are the only ones that exist; there is deliberately no
 * generic multiple-choice fallback.
 */

const TABLE_NAME = process.env.TABLE_NAME ?? '';
const MODEL_ID = process.env.MODEL_ID ?? '';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const bedrock = new BedrockRuntimeClient({});

interface ScoringJob {
  userId: string;
  orgId: string;
  assessmentId: string;
  /** The attempt's sort key timestamp — identifies which attempt to score. */
  submittedAt: string;
}

interface SqsRecord {
  messageId: string;
  body: string;
}

const KIND_GUIDANCE: Record<string, string> = {
  'identify-part':
    'The worker tapped a component on a machine model. Judge whether they identified the right part and whether their reasoning shows they understand its function.',
  'sequence-procedure':
    'The worker ordered the steps of a maintenance or lockout/tagout procedure. Judge the ordering, and weight any safety step placed out of order heavily — an isolation step in the wrong place is a failure even if the rest is correct.',
  'diagnose-by-voice':
    'The worker talked through a fault-finding path aloud. Score the REASONING, not whether they reached the single right answer: a sound diagnostic sequence that stops short is worth more than a lucky guess.',
};

const SYSTEM_PROMPT = [
  'You assess trainees in industrial maintenance (electrical, hydraulics, mechanical).',
  'Reply with ONLY a JSON object, no prose and no code fence, shaped exactly:',
  '{"score":0-100,"feedback":"...","strengths":["..."],"gaps":["..."]}',
  'feedback is addressed to the worker, in plain language, at most 3 sentences.',
  'Be specific about what to do differently; never just say "incorrect".',
  'Safety errors cap the score at 50 however good the rest is.',
].join(' ');

function parseScore(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('scorer returned no JSON object');
  const parsed = JSON.parse(cleaned.slice(start, end + 1));

  const score = Number(parsed.score);
  if (!Number.isFinite(score)) throw new Error('scorer returned a non-numeric score');

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback.slice(0, 1200) : '',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s: unknown) => typeof s === 'string').slice(0, 5) : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.filter((s: unknown) => typeof s === 'string').slice(0, 5) : [],
  };
}

async function scoreOne(job: ScoringJob): Promise<void> {
  const attemptKey = keys.attempt(job.userId, job.assessmentId, job.submittedAt);

  const attemptRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: attemptKey }));
  const attempt = attemptRes.Item;
  if (!attempt) {
    console.warn('attempt no longer exists, skipping', job.assessmentId, job.submittedAt);
    return;
  }
  // A userId is never authorization on its own — USER# keys carry no tenant.
  if (attempt.orgId !== job.orgId) {
    throw new Error('tenant mismatch between queued job and stored attempt');
  }
  // Idempotent: a redelivered message must not re-score and re-bill.
  if (attempt.status === 'scored') {
    console.log('already scored, skipping', job.assessmentId, job.submittedAt);
    return;
  }

  const definition = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: keys.assessment(job.orgId, job.assessmentId) })
  );
  const kind = String(definition.Item?.kind ?? 'diagnose-by-voice');
  const title = String(definition.Item?.title ?? job.assessmentId);

  const prompt = [
    `Assessment: ${title}`,
    `Kind: ${kind}`,
    KIND_GUIDANCE[kind] ?? KIND_GUIDANCE['diagnose-by-voice'],
    '',
    "The worker's submission:",
    JSON.stringify(attempt.response ?? null).slice(0, 6000),
  ].join('\n');

  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  );

  const payload = JSON.parse(new TextDecoder().decode(res.body));
  const text = payload?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('unexpected Bedrock response shape');
  const result = parseScore(text);

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: attemptKey,
      // Guarded so two concurrent deliveries cannot both write a score.
      ConditionExpression: 'attribute_exists(PK) AND #status = :pending',
      UpdateExpression:
        'SET #status = :scored, score = :score, feedback = :feedback, strengths = :strengths, gaps = :gaps, scoredAt = :now, #orgId = :orgId',
      ExpressionAttributeNames: { '#status': 'status', '#orgId': 'orgId' },
      ExpressionAttributeValues: {
        ':pending': 'pending',
        ':scored': 'scored',
        ':score': result.score,
        ':feedback': result.feedback,
        ':strengths': result.strengths,
        ':gaps': result.gaps,
        ':now': new Date().toISOString(),
        ':orgId': job.orgId,
      },
    })
  );

  console.log('scored', job.assessmentId, job.submittedAt, result.score);
}

export const handler = async (event: { Records: SqsRecord[] }) => {
  if (!TABLE_NAME) throw new Error('TABLE_NAME is not configured');
  if (!MODEL_ID) throw new Error('MODEL_ID is not configured');

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records ?? []) {
    try {
      await scoreOne(JSON.parse(record.body) as ScoringJob);
    } catch (err) {
      // A ConditionalCheckFailed means someone else scored it first — that is
      // success, not failure, and must not be retried into the model.
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        console.log('lost the race to another consumer, treating as done');
        continue;
      }
      console.error('scoring failed', record.messageId, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
