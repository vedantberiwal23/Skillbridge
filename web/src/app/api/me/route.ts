import { NextRequest, NextResponse } from 'next/server';
import { BatchGetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { keys, prefixes, userPk } from '@/lib/keys';
import { requestPlanGeneration } from '@/lib/agents';
import { requireSession, handleApiError, AuthError } from '@/lib/auth';
import { parseBody, updateMeSchema } from '@/lib/validation';
import { UserProfile, UserSettings } from '@/lib/types';

/**
 * GET /api/me — Profile + settings for the signed-in worker (Pattern W1).
 *
 * Single batch fetch on USER#<userId> with SK in (PROFILE, SETTINGS).
 * Verifies tenant boundary against verified session claim.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(undefined, req);

    const res = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: [keys.profile(session.userId), keys.settings(session.userId)],
          },
        },
      })
    );

    const items = res.Responses?.[TABLE_NAME] ?? [];
    const profile = items.find((i) => i.SK === 'PROFILE') as UserProfile | undefined;
    const settings = items.find((i) => i.SK === 'SETTINGS') as UserSettings | undefined;

    if (profile && profile.orgId !== session.orgId) {
      throw new AuthError('Tenant isolation violation', 403);
    }

    return NextResponse.json({
      profile: profile ?? null,
      settings: settings ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface UpdateSpec {
  key: ReturnType<typeof keys.profile>;
  sets: string[];
  names: Record<string, string>;
  values: Record<string, unknown>;
}

/**
 * Apply one update.
 *
 * Two guards matter here. `attribute_exists(PK)` stops UpdateItem doing what it
 * does by default on a missing key — creating the item from just the attributes
 * in this expression, leaving a PROFILE or SETTINGS record with no `orgId` and
 * no `userId`, which then fails every isolation check downstream. And `orgId` is
 * written on every update regardless, because CLAUDE.md requires it present on
 * every item this code writes.
 */
async function applyUpdate(spec: UpdateSpec, orgId: string) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: spec.key,
      ConditionExpression: 'attribute_exists(PK)',
      UpdateExpression: `SET ${[...spec.sets, '#orgId = :orgId'].join(', ')}`,
      ExpressionAttributeNames: { ...spec.names, '#orgId': 'orgId' },
      ExpressionAttributeValues: { ...spec.values, ':orgId': orgId },
    })
  );
}

/**
 * PATCH /api/me — Update profile and/or settings for the signed-in worker.
 *
 * Writes only into the caller's own `USER#<sub>` partition, where the sub comes
 * from the verified token — there is no addressable way to reach another user.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession(undefined, req);
    const body = parseBody(updateMeSchema, await req.json());

    const updates: UpdateSpec[] = [];

    const settings: UpdateSpec = {
      key: keys.settings(session.userId),
      sets: [],
      names: {},
      values: {},
    };
    if (body.language !== undefined) {
      settings.sets.push('#lang = :lang');
      settings.names['#lang'] = 'language';
      settings.values[':lang'] = body.language;
    }
    if (body.learningMode !== undefined) {
      settings.sets.push('#mode = :mode');
      settings.names['#mode'] = 'learningMode';
      settings.values[':mode'] = body.learningMode;
    }
    if (body.accessibilityMode !== undefined) {
      settings.sets.push('#a11y = :a11y');
      settings.names['#a11y'] = 'accessibilityMode';
      settings.values[':a11y'] = body.accessibilityMode;
    }
    if (settings.sets.length > 0) updates.push(settings);

    const profile: UpdateSpec = {
      key: keys.profile(session.userId),
      sets: [],
      names: {},
      values: {},
    };
    if (body.name !== undefined) {
      profile.sets.push('#name = :name');
      profile.names['#name'] = 'name';
      profile.values[':name'] = body.name;
    }
    if (body.profession !== undefined) {
      profile.sets.push('#prof = :prof');
      profile.names['#prof'] = 'profession';
      profile.values[':prof'] = body.profession;
    }
    if (body.skillLevel !== undefined) {
      profile.sets.push('#lvl = :lvl');
      profile.names['#lvl'] = 'skillLevel';
      profile.values[':lvl'] = body.skillLevel;
    }
    if (profile.sets.length > 0) updates.push(profile);

    try {
      await Promise.all(updates.map((spec) => applyUpdate(spec, session.orgId)));
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        throw new AuthError('Profile or settings record does not exist', 404);
      }
      throw err;
    }

    // Finishing onboarding is what a learning plan is generated from. The
    // generator is an async-tier agent, so this writes the pending header,
    // enqueues and returns — the plan screen re-fetches once it lands.
    let planQueued = false;
    if (body.profession !== undefined && body.profession !== null) {
      planQueued = await ensurePlan(session.userId, session.orgId, body.profession, body.skillLevel ?? null);
    }

    return NextResponse.json({ success: true, planQueued });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Give a worker their first plan, once.
 *
 * Returns false when they already have one: re-running onboarding must not
 * queue a second generation or overwrite the plan they are partway through.
 */
async function ensurePlan(
  userId: string,
  orgId: string,
  profession: string,
  skillLevel: string | null
): Promise<boolean> {
  const existing = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': userPk(userId), ':sk': prefixes.plan },
      Limit: 1,
    })
  );
  if ((existing.Items ?? []).length > 0) return false;

  const planId = 'plan-core';
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...keys.plan(userId, planId),
        userId,
        orgId,
        planId,
        profession,
        skillLevel,
        // The first 90 days are where attrition concentrates, so a new
        // worker's first plan is the front-loaded one.
        isFastTrack: true,
        status: 'pending',
        requestedAt: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    })
  );

  return requestPlanGeneration({ userId, orgId, planId, profession, skillLevel: skillLevel ?? undefined, isFastTrack: true });
}
