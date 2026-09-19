import { NextRequest, NextResponse } from 'next/server';
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { ddb, TABLE_NAME } from '@/lib/ddb';
import { gsi1, keys, orgPk, prefixes } from '@/lib/keys';
import { requireSession, handleApiError, AuthError } from '@/lib/auth';
import { assertDeptInScope, defaultDept } from '@/lib/scope';
import { queryDirectory } from '@/lib/directory';
import { updateCognitoDept } from '@/lib/cognito';
import { parseBody, moveMemberSchema } from '@/lib/validation';
import type { TeamMember } from '@/lib/types';

/**
 * GET /api/team?deptId= — the workers in one department (Pattern M4, roster).
 *
 * One paged Query on GSI1 — `ORG#<orgId>` / `DEPT#<deptId>#ROLE#worker#`. This
 * is a directory listing, not a rollup: it returns what each PROFILE already
 * says and never loops per worker. Numbers stay on `/api/aggregates`.
 *
 * `deptId` must be a department the caller manages (`lib/scope.ts`); without
 * it, the caller's own department.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession('manager', req);
    const deptId = await defaultDept(session, new URL(req.url).searchParams.get('deptId'));

    const { entries, truncated } = await queryDirectory(
      session.orgId,
      gsi1.deptRolePrefix(deptId, 'worker')
    );
    const members: TeamMember[] = entries.map(({ userId, name, profession, skillLevel }) => ({
      userId,
      name,
      profession,
      skillLevel,
    }));
    return NextResponse.json({ deptId, members, truncated });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/team — move a person into another department.
 *
 * A manager may move workers between departments they run; an admin may move
 * anyone. The PROFILE's `deptId` and its GSI1 sort key change together in one
 * UpdateItem so the directory never shows the person in both places, then the
 * person is dropped from the old department's groups and the Cognito claim is
 * brought in step.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession('manager', req);
    const { userId, deptId } = parseBody(moveMemberSchema, await req.json());

    const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: keys.profile(userId) }));
    const profile = res.Item;
    if (!profile || profile.orgId !== session.orgId) throw new AuthError('Person not found', 404);

    const fromDept = (profile.deptId as string | null) ?? null;
    if (fromDept === deptId) return NextResponse.json({ success: true, deptId });

    if (session.role !== 'admin') {
      if (profile.role !== 'worker') throw new AuthError('Only an admin can move managers', 403);
      if (!fromDept) throw new AuthError('Only an admin can place unassigned people', 403);
      await assertDeptInScope(session, fromDept);
    }
    await assertDeptInScope(session, deptId);

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: keys.profile(userId),
        ConditionExpression: 'attribute_exists(PK) AND orgId = :orgId',
        UpdateExpression: 'SET deptId = :dept, GSI1SK = :sk, orgId = :orgId',
        ExpressionAttributeValues: {
          ':dept': deptId,
          ':sk': gsi1.sk(deptId, profile.role as string, userId),
          ':orgId': session.orgId,
        },
      })
    );

    if (fromDept) {
      const groups = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': orgPk(session.orgId), ':sk': prefixes.groupsFor(fromDept) },
        })
      );
      await Promise.all(
        (groups.Items ?? [])
          .filter((g) => Array.isArray(g.memberIds) && g.memberIds.includes(userId))
          .map((g) =>
            ddb.send(
              new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: g.PK, SK: g.SK },
                UpdateExpression: 'SET memberIds = :members',
                ExpressionAttributeValues: {
                  ':members': (g.memberIds as string[]).filter((id) => id !== userId),
                },
              })
            )
          )
      );
    }

    await updateCognitoDept(userId, deptId);
    return NextResponse.json({ success: true, deptId });
  } catch (error) {
    return handleApiError(error);
  }
}
