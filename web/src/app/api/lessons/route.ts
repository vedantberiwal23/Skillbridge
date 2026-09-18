import { NextRequest, NextResponse } from 'next/server';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { orgPk, keys } from '@/lib/keys';
import { requireSession, handleApiError } from '@/lib/auth';
import { Lesson, MachineAsset } from '@/lib/types';

/**
 * GET /api/lessons — Org lesson content including 3D asset references (Pattern W3).
 *
 * If ?lessonId=<id> is supplied:
 *   Fetches the specific lesson item PK=ORG#<orgId>, SK=LESSON#<id>.
 *   If the lesson references an assetId, also fetches PK=ORG#<orgId>, SK=ASSET#<assetId>.
 * If no lessonId is supplied:
 *   Queries all lessons for the organization via begins_with(SK, 'LESSON#').
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(undefined, req);
    const { searchParams } = new URL(req.url);
    const lessonId = searchParams.get('lessonId') || searchParams.get('id');

    if (lessonId) {
      const lessonRes = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: keys.lesson(session.orgId, lessonId),
        })
      );

      const lesson = lessonRes.Item as Lesson | undefined;
      if (!lesson) {
        return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
      }

      let asset: MachineAsset | null = null;
      if (lesson.assetId) {
        const assetRes = await ddb.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: keys.asset(session.orgId, lesson.assetId),
          })
        );
        asset = (assetRes.Item as MachineAsset) ?? null;
      }

      return NextResponse.json({ lesson, asset });
    }

    // List all lessons for this tenant
    const listRes = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': orgPk(session.orgId),
          ':skPrefix': 'LESSON#',
        },
      })
    );

    const lessons = (listRes.Items as Lesson[]) ?? [];
    return NextResponse.json({ lessons });
  } catch (error) {
    return handleApiError(error);
  }
}
