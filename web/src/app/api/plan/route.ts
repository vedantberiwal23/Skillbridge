import { NextRequest, NextResponse } from 'next/server';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { userPk, keys } from '@/lib/keys';
import { requireSession, handleApiError } from '@/lib/auth';
import { LearningPlan, PlanModule } from '@/lib/types';

/**
 * GET /api/plan — Worker's learning plan and module progress (Pattern W2).
 *
 * Query on PK=USER#<userId> with SK begins_with PLAN#.
 * Assembles the plan metadata with its child modules, explicitly sorted by `seq`.
 */
export async function GET(req?: NextRequest) {
  try {
    const session = await requireSession(undefined, req);

    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': userPk(session.userId),
          ':skPrefix': 'PLAN#',
        },
      })
    );

    const items = res.Items ?? [];
    if (items.length === 0) {
      return NextResponse.json({ plan: null });
    }

    // Identify plan header item (SK matches PLAN#<planId> with no #MOD#)
    const planHeader = items.find((item) => !item.SK.includes('#MOD#'));
    if (!planHeader) {
      return NextResponse.json({ plan: null });
    }

    // Filter module items (SK contains #MOD#) and sort by seq attribute
    const moduleItems: PlanModule[] = items
      .filter((item) => item.SK.includes('#MOD#'))
      .map((item) => ({
        seq: Number(item.seq),
        lessonId: item.lessonId,
        title: item.title,
        completedAt: item.completedAt ?? null,
      }))
      .sort((a, b) => a.seq - b.seq);

    const plan: LearningPlan = {
      userId: session.userId,
      planId: planHeader.planId,
      profession: planHeader.profession ?? '',
      skillLevel: planHeader.skillLevel ?? '',
      isFastTrack: Boolean(planHeader.isFastTrack),
      modules: moduleItems,
    };

    return NextResponse.json({ plan });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/plan — Mark a plan module completed or update cursor (Pattern W8).
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { planId, seq, completed } = body;

    if (!planId || typeof seq !== 'number') {
      return NextResponse.json(
        { error: 'planId and numeric seq are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const moduleKey = keys.planModule(session.userId, planId, seq);

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: moduleKey,
        UpdateExpression: 'SET completedAt = :completedAt',
        ExpressionAttributeValues: {
          ':completedAt': completed ? now : null,
        },
      })
    );

    return NextResponse.json({ success: true, completedAt: completed ? now : null });
  } catch (error) {
    return handleApiError(error);
  }
}
