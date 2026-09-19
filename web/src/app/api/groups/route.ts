import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { ddb, TABLE_NAME } from '@/lib/ddb';
import { gsi1, keys, orgPk, prefixes } from '@/lib/keys';
import { requireSession, handleApiError, AuthError } from '@/lib/auth';
import { assertDeptInScope, withoutKeys } from '@/lib/scope';
import { queryDirectory } from '@/lib/directory';
import { parseBody, createGroupSchema, updateGroupSchema } from '@/lib/validation';
import type { WorkGroup } from '@/lib/types';

/**
 * Working groups inside a department — crews, shifts, lines.
 *
 * A manager maintains the groups of the departments they run; an admin, any.
 * Membership is limited to people currently in that department, checked
 * against the directory on every write, so a group can never reach across a
 * department (or tenant) boundary.
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function stripKeys(item: Record<string, unknown>): WorkGroup {
  return withoutKeys(item) as unknown as WorkGroup;
}

async function assertMembersInDept(orgId: string, deptId: string, memberIds: string[]) {
  if (memberIds.length === 0) return [];
  const { entries } = await queryDirectory(orgId, gsi1.deptPrefix(deptId));
  const inDept = new Set(entries.map((e) => e.userId));
  const unique = [...new Set(memberIds)];
  if (unique.some((id) => !inDept.has(id))) {
    throw new AuthError('Group members must belong to this department', 400);
  }
  return unique;
}

/** GET /api/groups?deptId= */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession('manager', req);
    const deptId = new URL(req.url).searchParams.get('deptId');
    if (!deptId || !ID.test(deptId)) throw new AuthError('deptId is required', 400);
    await assertDeptInScope(session, deptId);

    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': orgPk(session.orgId), ':sk': prefixes.groupsFor(deptId) },
      })
    );
    const groups = (res.Items ?? [])
      .filter((g) => g.orgId === session.orgId)
      .map(stripKeys)
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ groups });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/groups — create a group, optionally with its first members. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession('manager', req);
    const body = parseBody(createGroupSchema, await req.json());
    await assertDeptInScope(session, body.deptId);
    const memberIds = await assertMembersInDept(session.orgId, body.deptId, body.memberIds);

    const groupId = `grp-${crypto.randomBytes(4).toString('hex')}`;
    const item = {
      ...keys.group(session.orgId, body.deptId, groupId),
      orgId: session.orgId,
      deptId: body.deptId,
      groupId,
      name: body.name,
      memberIds,
      createdAt: new Date().toISOString(),
    };
    await ddb.send(
      new PutCommand({ TableName: TABLE_NAME, Item: item, ConditionExpression: 'attribute_not_exists(PK)' })
    );
    return NextResponse.json({ group: stripKeys(item) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/groups — rename a group or replace its member list. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession('manager', req);
    const body = parseBody(updateGroupSchema, await req.json());
    await assertDeptInScope(session, body.deptId);

    const sets = ['#orgId = :orgId'];
    const names: Record<string, string> = { '#orgId': 'orgId' };
    const values: Record<string, unknown> = { ':orgId': session.orgId };
    if (body.name !== undefined) {
      sets.push('#name = :name');
      names['#name'] = 'name';
      values[':name'] = body.name;
    }
    if (body.memberIds !== undefined) {
      sets.push('#members = :members');
      names['#members'] = 'memberIds';
      values[':members'] = await assertMembersInDept(session.orgId, body.deptId, body.memberIds);
    }

    try {
      const res = await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: keys.group(session.orgId, body.deptId, body.groupId),
          ConditionExpression: 'attribute_exists(PK)',
          UpdateExpression: `SET ${sets.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        })
      );
      return NextResponse.json({ group: stripKeys(res.Attributes ?? {}) });
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        throw new AuthError('Group not found', 404);
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/groups?deptId=&groupId= — the people stay; only the grouping goes. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession('manager', req);
    const params = new URL(req.url).searchParams;
    const deptId = params.get('deptId');
    const groupId = params.get('groupId');
    if (!deptId || !groupId || !ID.test(deptId) || !ID.test(groupId)) {
      throw new AuthError('deptId and groupId are required', 400);
    }
    await assertDeptInScope(session, deptId);
    await ddb.send(
      new DeleteCommand({ TableName: TABLE_NAME, Key: keys.group(session.orgId, deptId, groupId) })
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
