import { NextRequest, NextResponse } from 'next/server';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { userPk, keys, prefixes, isPlanHeader } from '@/lib/keys';
import { requireSession, handleApiError, AuthError } from '@/lib/auth';
import { parseBody, updatePlanSchema } from '@/lib/validation';
import { LearningPlan, PlanModule } from '@/lib/types';

/** `PLAN#<planId>` and `PLAN#<planId>#MOD#<seq>` both yield `<planId>`. */
function planIdFromSk(sk: string): string {
  const rest = sk.slice(prefixes.plan.length);
  const moduleMarker = rest.indexOf('#MOD#');
  return moduleMarker === -1 ? rest : rest.slice(0, moduleMarker);
}

type Item = Record<string, unknown>;

function assemblePlan(userId: string, header: Item, moduleItems: Item[]): LearningPlan {
  return {
    userId,
    planId: header.planId as string,
    profession: (header.profession as string) ?? '',
    skillLevel: (header.skillLevel as string) ?? '',
    isFastTrack: Boolean(header.isFastTrack),
    modules: moduleItems
      .map(
        (item): PlanModule => ({
          seq: Number(item.seq),
          lessonId: item.lessonId as string,
          title: item.title as string,
          completedAt: (item.completedAt as string | null) ?? null,
        })
      )
      // `keys.planModule` zero-pads seq so the sort key already orders correctly,
      // but sorting on the attribute keeps this right even for items written
      // before that padding existed.
      .sort((a, b) => a.seq - b.seq),
  };
}

/**
 * GET /api/plan — Worker's learning plan and module progress (Pattern W2).
 *
 * A worker can hold more than one plan — FEATURES.md §8 puts the first-90-days
 * fast-track path alongside the general curriculum — so modules are grouped by
 * the planId embedded in their sort key. Querying the bare `PLAN#` prefix and
 * attaching every module found to the first header would silently show one
 * plan's modules under another plan's title.
 *
 * `?planId=` narrows to one plan. Without it, every plan is assembled and the
 * fast-track one leads, since it is by definition the front-loaded path.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(undefined, req);
    const { searchParams } = new URL(req.url);
    const planId = searchParams.get('planId');

    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': userPk(session.userId),
          // planScope is a prefix, so `p1` would also match `p10` — the grouping
          // below keys on the exact planId rather than trusting the prefix.
          ':skPrefix': planId ? prefixes.planScope(planId) : prefixes.plan,
        },
      })
    );

    const items = (res.Items ?? []) as Item[];
    const headers = new Map<string, Item>();
    const modules = new Map<string, Item[]>();

    for (const item of items) {
      const sk = item.SK as string;
      const id = planIdFromSk(sk);
      if (planId && id !== planId) continue;
      if (isPlanHeader(sk)) {
        headers.set(id, item);
      } else {
        const list = modules.get(id) ?? [];
        list.push(item);
        modules.set(id, list);
      }
    }

    const plans = [...headers.entries()]
      .map(([id, header]) => assemblePlan(session.userId, header, modules.get(id) ?? []))
      .sort((a, b) => {
        if (a.isFastTrack !== b.isFastTrack) return a.isFastTrack ? -1 : 1;
        return a.planId.localeCompare(b.planId);
      });

    return NextResponse.json({ plan: plans[0] ?? null, plans });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/plan — Mark a plan module completed or not (Pattern W8).
 *
 * Guarded on `attribute_exists(PK)`: without it an UpdateItem against a module
 * that does not exist creates one carrying only `completedAt` — no `seq`, no
 * `lessonId`, no `orgId` — which then reads back as a module with `seq: NaN`.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession(undefined, req);
    const { planId, seq, completed } = parseBody(updatePlanSchema, await req.json());

    const now = new Date().toISOString();

    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: keys.planModule(session.userId, planId, seq),
          ConditionExpression: 'attribute_exists(PK)',
          UpdateExpression: 'SET completedAt = :completedAt, #orgId = :orgId',
          ExpressionAttributeNames: { '#orgId': 'orgId' },
          ExpressionAttributeValues: {
            ':completedAt': completed ? now : null,
            ':orgId': session.orgId,
          },
        })
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        throw new AuthError('Plan module not found', 404);
      }
      throw err;
    }

    return NextResponse.json({ success: true, completedAt: completed ? now : null });
  } catch (error) {
    return handleApiError(error);
  }
}
