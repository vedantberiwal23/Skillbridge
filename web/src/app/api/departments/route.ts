import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { ddb, TABLE_NAME } from '@/lib/ddb';
import { gsi1, keys, orgPk, prefixes } from '@/lib/keys';
import { requireSession, handleApiError, AuthError } from '@/lib/auth';
import { departmentsInScope, getDepartment, withoutKeys } from '@/lib/scope';
import { parseBody, createDepartmentSchema, updateDepartmentSchema } from '@/lib/validation';
import type { Department } from '@/lib/types';

/**
 * GET /api/departments — the departments the caller may manage.
 *
 * An admin sees every department in the org; a manager sees the ones they run.
 * Scope is resolved by `departmentsInScope`, never by anything in the request.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession('manager', req);
    const departments = await departmentsInScope(session);
    return NextResponse.json({ departments });
  } catch (error) {
    return handleApiError(error);
  }
}

function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'dept'
  );
}

/** POST /api/departments — admin creates a department. The id is minted here. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession('admin', req);
    const body = parseBody(createDepartmentSchema, await req.json());

    const existing = await departmentsInScope(session);
    if (existing.some((d) => d.name.toLowerCase() === body.name.toLowerCase())) {
      throw new AuthError('A department with that name already exists', 409);
    }

    const deptId = `dept-${slug(body.name)}-${crypto.randomBytes(2).toString('hex')}`;
    const item: Department & { PK: string; SK: string } = {
      ...keys.department(session.orgId, deptId),
      orgId: session.orgId,
      deptId,
      name: body.name,
      description: body.description ?? null,
      managerIds: [],
      createdAt: new Date().toISOString(),
    };
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );
    return NextResponse.json({ department: withoutKeys(item) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/departments — admin renames a department or sets who manages it.
 *
 * Every managerId must be a manager in this org: checked against their PROFILE,
 * so an admin cannot hand a department to a worker or to someone in another org.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession('admin', req);
    const body = parseBody(updateDepartmentSchema, await req.json());

    const dept = await getDepartment(session.orgId, body.deptId);
    if (!dept) throw new AuthError('Department not found', 404);

    if (body.managerIds && body.managerIds.length > 0) {
      const ids = [...new Set(body.managerIds)];
      const res = await ddb.send(
        new BatchGetCommand({
          RequestItems: { [TABLE_NAME]: { Keys: ids.map((id) => keys.profile(id)) } },
        })
      );
      const profiles = res.Responses?.[TABLE_NAME] ?? [];
      const valid = new Set(
        profiles
          .filter((p) => p.orgId === session.orgId && p.role === 'manager')
          .map((p) => p.userId as string)
      );
      const invalid = ids.filter((id) => !valid.has(id));
      if (invalid.length > 0) {
        throw new AuthError('Only managers in this organization can run a department', 400);
      }
      body.managerIds = ids;
    }

    const sets: string[] = ['#orgId = :orgId'];
    const names: Record<string, string> = { '#orgId': 'orgId' };
    const values: Record<string, unknown> = { ':orgId': session.orgId };
    if (body.name !== undefined) {
      sets.push('#name = :name');
      names['#name'] = 'name';
      values[':name'] = body.name;
    }
    if (body.description !== undefined) {
      sets.push('#desc = :desc');
      names['#desc'] = 'description';
      values[':desc'] = body.description;
    }
    if (body.managerIds !== undefined) {
      sets.push('#mgr = :mgr');
      names['#mgr'] = 'managerIds';
      values[':mgr'] = body.managerIds;
    }

    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: keys.department(session.orgId, body.deptId),
        ConditionExpression: 'attribute_exists(PK)',
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );
    return NextResponse.json({ department: withoutKeys(res.Attributes ?? {}) });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/departments?deptId= — admin removes an EMPTY department.
 *
 * Refused while anyone is still in it: deleting it would strand those people
 * with a deptId that points at nothing. Its groups go with it.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession('admin', req);
    const deptId = new URL(req.url).searchParams.get('deptId');
    if (!deptId || !/^[A-Za-z0-9_-]{1,64}$/.test(deptId)) {
      throw new AuthError('deptId is required', 400);
    }

    const occupied = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
        ExpressionAttributeValues: { ':pk': gsi1.pk(session.orgId), ':sk': gsi1.deptPrefix(deptId) },
        Limit: 1,
      })
    );
    if ((occupied.Items ?? []).length > 0) {
      throw new AuthError('Move everyone out of this department before deleting it', 409);
    }

    const groups = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': orgPk(session.orgId), ':sk': prefixes.groupsFor(deptId) },
        ProjectionExpression: 'PK, SK',
      })
    );
    const groupKeys = (groups.Items ?? []).map((g) => ({ PK: g.PK, SK: g.SK }));
    for (let i = 0; i < groupKeys.length; i += 25) {
      await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: groupKeys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })),
          },
        })
      );
    }

    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: keys.department(session.orgId, deptId),
        ConditionExpression: 'attribute_exists(PK)',
      })
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return handleApiError(new AuthError('Department not found', 404));
    }
    return handleApiError(error);
  }
}
