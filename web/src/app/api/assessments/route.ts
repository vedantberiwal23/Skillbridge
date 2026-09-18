import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { GetCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { orgPk, userPk, keys, eventTtl } from '@/lib/keys';
import { requireSession, handleApiError } from '@/lib/auth';
import { Assessment, AssessmentAttempt } from '@/lib/types';

/**
 * GET /api/assessments — Definitions and worker attempt history (Pattern W4).
 *
 * If ?assessmentId=<id> is supplied:
 *   Fetches assessment definition from ORG#<orgId> and user's attempts from USER#<userId>.
 * If no assessmentId is supplied:
 *   Queries all assessment definitions under the organization.
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
            ':skPrefix': `ATTEMPT#${assessmentId}#`,
          },
        })
      );

      const attempts = (attemptsRes.Items as AssessmentAttempt[]) ?? [];
      return NextResponse.json({ assessment, attempts });
    }

    // List all assessment definitions for the org
    const listRes = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': orgPk(session.orgId),
          ':skPrefix': 'ASMT#',
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
 * POST /api/assessments — Submit an attempt for scoring (Pattern W4 & S1).
 *
 * Writes the attempt under USER#<userId> with an ISO-8601 UTC sort key.
 * Also emits an async activity EVT# item carrying the mandatory 90-day ttl attribute
 * for the background skill profiler pipeline.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(undefined, req);
    const body = await req.json();
    const { assessmentId, score = 100, feedback = 'Completed assessment' } = body;

    if (!assessmentId || typeof assessmentId !== 'string') {
      return NextResponse.json({ error: 'assessmentId is required' }, { status: 400 });
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
      score: Number(score),
      feedback: String(feedback),
    };

    const eventId = crypto.randomUUID();
    const eventKey = keys.event(session.userId, ts, eventId);
    const eventItem = {
      PK: eventKey.PK,
      SK: eventKey.SK,
      userId: session.userId,
      orgId: session.orgId,
      type: 'ASSESSMENT_ATTEMPT',
      assessmentId,
      score: Number(score),
      ttl: eventTtl(), // Mandatory 90-day epoch seconds TTL
    };

    await Promise.all([
      ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: attemptItem,
        })
      ),
      ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: eventItem,
        })
      ),
    ]);

    return NextResponse.json({ attempt: attemptItem }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
