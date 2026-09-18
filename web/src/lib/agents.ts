import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

/**
 * Hand work to the async-tier agents.
 *
 * CLAUDE.md: "Learning plan generation and assessment scoring are triggered on
 * demand but must return before the model finishes: write a pending item, hand
 * work off, let the client re-fetch." So a route writes its pending record,
 * calls one of these, and returns — it never waits on Sonnet.
 *
 * A queue each, never a shared one: FEATURES.md §13 keeps one flow per agent so
 * no agent can reach another's work, and the SSR compute role holds
 * `sqs:SendMessage` and nothing else on either.
 */

const sqs = new SQSClient({
  region: process.env.NEXT_PUBLIC_AWS_REGION ?? 'ap-northeast-1',
});

const SCORER_QUEUE_URL = process.env.ASSESSMENT_SCORER_QUEUE_URL ?? '';
const PLAN_QUEUE_URL = process.env.LEARNING_PLAN_QUEUE_URL ?? '';

export interface ScoringJob {
  userId: string;
  orgId: string;
  assessmentId: string;
  submittedAt: string;
}

export interface PlanJob {
  userId: string;
  orgId: string;
  planId: string;
  profession?: string;
  skillLevel?: string;
  isFastTrack?: boolean;
}

/**
 * Enqueue, and never fail the caller's request because of it.
 *
 * The pending item is already durable at this point, so a lost message costs a
 * retry, not the submission. Throwing here would turn a successful write into a
 * 500 and lose the work the worker actually did.
 */
async function enqueue(queueUrl: string, job: unknown, label: string): Promise<boolean> {
  if (!queueUrl) {
    console.error(`[agents] ${label} queue URL is not configured; work not enqueued`);
    return false;
  }
  try {
    await sqs.send(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job) })
    );
    return true;
  } catch (err) {
    console.error(`[agents] failed to enqueue ${label}:`, err);
    return false;
  }
}

export const requestScoring = (job: ScoringJob) =>
  enqueue(SCORER_QUEUE_URL, job, 'assessment scoring');

export const requestPlanGeneration = (job: PlanJob) =>
  enqueue(PLAN_QUEUE_URL, job, 'learning plan generation');
