import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { keys, orgPk, prefixes } from '../shared/keys';

/**
 * Learning plan generator (FEATURES.md §3, §13).
 *
 * Async tier, queue-driven. Onboarding writes a pending plan and enqueues; the
 * worker fills it in and the client re-fetches. Nothing holds a request open.
 *
 * The plan is built from the org's OWN lesson catalogue rather than invented:
 * FEATURES.md §3 makes the generated curriculum the thing the RAG layer serves
 * from, and a plan referencing lessons that do not exist would send a worker to
 * an empty screen. The model chooses and orders from the real catalogue.
 */

const TABLE_NAME = process.env.TABLE_NAME ?? '';
const MODEL_ID = process.env.MODEL_ID ?? '';
const MAX_MODULES = 12;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const bedrock = new BedrockRuntimeClient({});

interface PlanJob {
  userId: string;
  orgId: string;
  planId: string;
  profession?: string;
  skillLevel?: string;
  /** First-90-days path: shorter, front-loaded (FEATURES.md §8). */
  isFastTrack?: boolean;
}

interface SqsRecord {
  messageId: string;
  body: string;
}

interface PlanModuleDraft {
  seq: number;
  lessonId: string;
  title: string;
  why: string;
}

interface CatalogueLesson {
  lessonId: string;
  title: string;
}

const SYSTEM_PROMPT = [
  'You build a vocational learning plan for an industrial maintenance trainee',
  '(electrical, hydraulics, mechanical).',
  'You are given the employer\'s ACTUAL lesson catalogue. Choose from it and order it;',
  'never invent a lessonId that is not in the catalogue.',
  'Order matters: foundations before diagnosis, and any safety or lockout/tagout',
  'lesson comes before the procedures it protects.',
  'Reply with ONLY a JSON object, no prose and no code fence:',
  '{"modules":[{"lessonId":"...","title":"...","why":"..."}]}',
  '"why" is one short sentence addressed to the worker.',
].join(' ');

function parsePlan(text: string, catalogue: CatalogueLesson[]): PlanModuleDraft[] {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('generator returned no JSON object');

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const known = new Map(catalogue.map((l) => [l.lessonId, l.title]));

  const modules = (Array.isArray(parsed.modules) ? parsed.modules : [])
    // Drop anything hallucinated. A plan pointing at a lesson that does not
    // exist is worse than a shorter plan.
    .filter((m: { lessonId?: unknown }) => typeof m.lessonId === 'string' && known.has(m.lessonId))
    .slice(0, MAX_MODULES)
    .map((m: { lessonId: string; title?: string; why?: string }, index: number) => ({
      seq: index + 1,
      lessonId: m.lessonId,
      title: typeof m.title === 'string' && m.title ? m.title : known.get(m.lessonId)!,
      why: typeof m.why === 'string' ? m.why.slice(0, 300) : '',
    }));

  if (modules.length === 0) throw new Error('generator produced no usable modules');
  return modules;
}

async function generateOne(job: PlanJob): Promise<void> {
  const planKey = keys.plan(job.userId, job.planId);

  const existing = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: planKey }));
  if (!existing.Item) {
    console.warn('plan record is gone, skipping', job.planId);
    return;
  }
  if (existing.Item.orgId !== job.orgId) {
    throw new Error('tenant mismatch between queued job and stored plan');
  }
  if (existing.Item.status === 'ready') {
    console.log('plan already generated, skipping', job.planId);
    return;
  }

  // The org's real catalogue, via the documented base-table prefix query.
  const cat = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': orgPk(job.orgId), ':sk': prefixes.lesson },
      ProjectionExpression: 'lessonId, title',
      Limit: 200,
    })
  );
  const catalogue = (cat.Items ?? []) as CatalogueLesson[];
  if (catalogue.length === 0) {
    throw new Error(`org ${job.orgId} has no lessons to build a plan from`);
  }

  const prompt = [
    `Profession: ${job.profession ?? 'industrial maintenance technician'}`,
    `Skill level: ${job.skillLevel ?? 'beginner'}`,
    job.isFastTrack
      ? 'This is a FIRST-90-DAYS fast-track path: at most 5 modules, front-loaded with what keeps a new starter safe and useful immediately.'
      : `Build a full plan of up to ${MAX_MODULES} modules.`,
    '',
    'Catalogue:',
    ...catalogue.map((l) => `- ${l.lessonId}: ${l.title}`),
  ].join('\n');

  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  );

  const payload = JSON.parse(new TextDecoder().decode(res.body));
  const text = payload?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('unexpected Bedrock response shape');
  const modules = parsePlan(text, catalogue);

  // Header and modules land together: a plan that is 'ready' while half its
  // modules are missing would render as a broken screen.
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: planKey,
            ConditionExpression: 'attribute_exists(PK)',
            UpdateExpression:
              'SET #status = :ready, moduleCount = :n, generatedAt = :now, #orgId = :orgId',
            ExpressionAttributeNames: { '#status': 'status', '#orgId': 'orgId' },
            ExpressionAttributeValues: {
              ':ready': 'ready',
              ':n': modules.length,
              ':now': new Date().toISOString(),
              ':orgId': job.orgId,
            },
          },
        },
        ...modules.map((m: PlanModuleDraft) => ({
          Put: {
            TableName: TABLE_NAME,
            Item: {
              // seq is zero-padded inside the key builder: unpadded, MOD#10
              // sorts before MOD#2 and the worker sees module 10 first.
              ...keys.planModule(job.userId, job.planId, m.seq),
              userId: job.userId,
              orgId: job.orgId,
              planId: job.planId,
              seq: m.seq,
              lessonId: m.lessonId,
              title: m.title,
              why: m.why,
              completedAt: null,
            },
          },
        })),
      ],
    })
  );

  console.log('generated plan', job.planId, 'with', modules.length, 'modules');
}

export const handler = async (event: { Records: SqsRecord[] }) => {
  if (!TABLE_NAME) throw new Error('TABLE_NAME is not configured');
  if (!MODEL_ID) throw new Error('MODEL_ID is not configured');

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records ?? []) {
    try {
      await generateOne(JSON.parse(record.body) as PlanJob);
    } catch (err) {
      console.error('plan generation failed', record.messageId, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
