import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { GetCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { orgPk, userPk, keys, prefixes, eventTtl } from '@/lib/keys';
import { requireSession, handleApiError, AuthError } from '@/lib/auth';
import { parseBody, submitAttemptSchema } from '@/lib/validation';
import { Assessment, AssessmentAttempt } from '@/lib/types';

/**
 * GET /api/assessments — Definitions and the caller's attempt history (W4).
 *
 * With ?assessmentId=<id>: the definition from ORG#<orgId> plus this worker's
 * attempts from their own USER# partition.
 * Without: every assessment definition for the organization.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(undefined, req);
    const { searchParams } = new URL(req.url);
    const assessmentId = searchParams.get('assessmentId') || searchParams.get('id');

    if (assessmentId) {
      const asmtRes = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          // orgId comes from the verified session, so this cannot address
          // another tenant's assessment.
          Key: keys.assessment(session.orgId, assessmentId),
        })
      );

      const assessment = asmtRes.Item as Assessment | undefined;
      if (!assessment) {
        return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
      }

      const attemptsRes = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': userPk(session.userId),
            ':skPrefix': prefixes.attemptsFor(assessmentId),
          },
        })
      );

      const attempts = (attemptsRes.Items as AssessmentAttempt[]) ?? [];
      return NextResponse.json({ assessment, attempts });
    }

    const listRes = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': orgPk(session.orgId),
          ':skPrefix': prefixes.assessment,
        },
      })
    );

    const assessments = (listRes.Items as Assessment[]) ?? [];
    return NextResponse.json({ assessments });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/assessments — Submit an attempt (Pattern W4).
 *
 * The attempt is written UNSCORED. Scoring is the assessment scorer agent's job
 * (FEATURES.md §13) and it runs on the async tier, so this handler must not wait
 * on it — it persists the submission and returns, and the client re-fetches for
 * the result once `status` turns to `scored`.
 *
 * The client never supplies `score`. It previously did, defaulting to 100, which
 * let any worker pass any assessment by posting their own mark.
 *
 * Still to wire (BACKEND.md work order item 5): the handoff that takes a pending
 * attempt and invokes the scorer. Until it exists, attempts stay `pending` —
 * which is visibly incomplete rather than silently wrong.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(undefined, req);
    const { assessmentId, response } = parseBody(submitAttemptSchema, await req.json());

    // An attempt against an assessment this org does not own would be scored
    // against nothing and would feed the profiler a dangling reference.
    const asmtRes = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: keys.assessment(session.orgId, assessmentId),
      })
    );
    if (!asmtRes.Item) {
      throw new AuthError('Assessment not found', 404);
    }

    const ts = new Date().toISOString();
    const attemptKey = keys.attempt(session.userId, assessmentId, ts);

    const attemptItem: AssessmentAttempt & { PK: string; SK: string; orgId: string } = {
      PK: attemptKey.PK,
      SK: attemptKey.SK,
      userId: session.userId,
      orgId: session.orgId,
      assessmentId,
      submittedAt: ts,
      status: 'pending',
      response: response ?? null,
      score: null,
      feedback: null,
    };

    const eventKey = keys.event(session.userId, ts, crypto.randomUUID());
    const eventItem = {
      PK: eventKey.PK,
      SK: eventKey.SK,
      userId: session.userId,
      orgId: session.orgId,
      type: 'ASSESSMENT_ATTEMPT',
      assessmentId,
      // `ttl`, spelled exactly that way and in epoch seconds — the table's
      // timeToLiveAttribute is 'ttl', and any other name is silently ignored,
      // making raw events a permanent record.
      ttl: eventTtl(),
    };

    await Promise.all([
      ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: attemptItem })),
      ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: eventItem })),
    ]);

    return NextResponse.json({ attempt: attemptItem }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
