import { QueryCommand } from '@aws-sdk/lib-dynamodb';

import { ddb, TABLE_NAME } from './ddb';
import { gsi1 } from './keys';
import type { DirectoryEntry, Role } from './types';

/** Upper bound on one directory read, across pages. */
const MAX_ITEMS = 2000;

/**
 * Read the org directory from GSI1 under one sort-key prefix.
 *
 * `DEPT#` is the whole org, `DEPT#<id>#` one department and
 * `DEPT#<id>#ROLE#worker#` its workers. It is a listing of PROFILE items and
 * nothing more — it never loops per person to compute anything.
 */
export async function queryDirectory(
  orgId: string,
  skPrefix: string
): Promise<{ entries: DirectoryEntry[]; truncated: boolean }> {
  const entries: DirectoryEntry[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
        ExpressionAttributeValues: { ':pk': gsi1.pk(orgId), ':sk': skPrefix },
        ExclusiveStartKey: startKey,
      })
    );
    for (const item of res.Items ?? []) {
      if (item.orgId !== orgId) continue;
      entries.push({
        userId: item.userId as string,
        name: (item.name as string) ?? '',
        role: item.role as Role,
        deptId: (item.deptId as string | null) ?? null,
        profession: (item.profession as string | null) ?? null,
        skillLevel: (item.skillLevel as string | null) ?? null,
      });
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey && entries.length < MAX_ITEMS);

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { entries, truncated: Boolean(startKey) };
}
