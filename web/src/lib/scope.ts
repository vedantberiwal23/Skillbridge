import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { ddb, TABLE_NAME } from './ddb';
import { keys, orgPk, prefixes } from './keys';
import { AuthError, type SessionUser } from './auth';
import type { Department } from './types';

/**
 * Which departments a signed-in manager or admin may see and change.
 *
 * - An admin is org root: every department in their org.
 * - A manager: the department they were invited into (their `deptId` claim),
 *   plus any department whose `managerIds` an admin has added them to.
 *
 * Resolved from DynamoDB on each call rather than from a token claim, so an
 * admin assigning a manager to a second department takes effect on the next
 * request instead of at the next token refresh. The org partition is
 * low-volume config and an org has tens of departments, so this is one small
 * Query.
 */
export async function listDepartments(orgId: string): Promise<Department[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': orgPk(orgId), ':sk': prefixes.department },
    })
  );
  return ((res.Items ?? []) as Department[])
    .filter((d) => d.orgId === orgId)
    .map((d) => ({ ...d, managerIds: d.managerIds ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function departmentsInScope(session: SessionUser): Promise<Department[]> {
  const all = await listDepartments(session.orgId);
  if (session.role === 'admin') return all;

  const mine = all.filter(
    (d) => d.deptId === session.deptId || (d.managerIds ?? []).includes(session.userId)
  );
  // A manager invited into a department that has no DEPT# item yet (created by
  // an older invite, or seeded without one) still manages it.
  if (session.deptId && !mine.some((d) => d.deptId === session.deptId)) {
    mine.unshift({ orgId: session.orgId, deptId: session.deptId, name: session.deptId, managerIds: [] });
  }
  return mine;
}

/** Throws 403 unless `deptId` is one the caller may manage. */
export async function assertDeptInScope(session: SessionUser, deptId: string): Promise<Department> {
  const scope = await departmentsInScope(session);
  const found = scope.find((d) => d.deptId === deptId);
  if (!found) {
    throw new AuthError('Forbidden: this department is outside your scope', 403);
  }
  return found;
}

/** The department the caller lands on when they do not name one. */
export async function defaultDept(session: SessionUser, requested: string | null): Promise<string> {
  if (requested) {
    await assertDeptInScope(session, requested);
    return requested;
  }
  if (session.deptId) return session.deptId;
  const scope = await departmentsInScope(session);
  if (scope.length === 0) throw new AuthError('No department is assigned to you yet', 404);
  return scope[0].deptId;
}

export async function getDepartment(orgId: string, deptId: string): Promise<Department | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: keys.department(orgId, deptId) })
  );
  const item = res.Item as Department | undefined;
  return item && item.orgId === orgId ? item : null;
}

/** Table keys are storage detail; they never go to the browser. */
export function withoutKeys<T extends object>(item: T): Omit<T, 'PK' | 'SK'> {
  return Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'PK' && k !== 'SK')) as Omit<T, 'PK' | 'SK'>;
}
