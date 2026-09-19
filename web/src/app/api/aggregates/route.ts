import { NextRequest, NextResponse } from 'next/server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { keys } from '@/lib/keys';
import { requireSession, handleApiError, AuthError } from '@/lib/auth';
import { DeptAggregate } from '@/lib/types';

/**
 * GET /api/aggregates — Materialized department rollups (Patterns M2, M3).
 *
 * Reads ONE precomputed item via a single GetItem.
 *
 * STRICT RULE (CLAUDE.md & DATA-MODEL.md Decision 1):
 * Never fan out over workers — not in this handler, not by looping GSI1 queries.
 * Aggregates are precomputed on write by the async skill profiler worker,
 * making the manager dashboard O(1) at any workforce size.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession('manager', req);
    const { searchParams } = new URL(req.url);
    const requestedDeptId = searchParams.get('deptId');

    /**
     * `orgId` already comes from the verified session, so no query parameter can
     * cross a tenant boundary here. The department boundary is a separate
     * question: a manager's scope is their own department (FEATURES.md §11), so
     * only an admin — org root — may name a different one.
     */
    if (requestedDeptId && requestedDeptId !== session.deptId && session.role !== 'admin') {
      throw new AuthError('Forbidden: managers may only read their own department', 403);
    }

    const deptId = requestedDeptId ?? session.deptId;
    if (!deptId) {
      return NextResponse.json(
        { error: 'Department ID (deptId) is required' },
        { status: 400 }
      );
    }

    // Default period to current YYYY-MM
    const currentPeriod = new Date().toISOString().slice(0, 7);
    const period = searchParams.get('period') || currentPeriod;

    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: keys.deptAggregate(session.orgId, deptId, period),
      })
    );

    const aggregate = res.Item as DeptAggregate | undefined;

    if (aggregate && aggregate.orgId !== session.orgId) {
      throw new AuthError('Tenant isolation violation', 403);
    }

    // If no aggregate exists yet for this period, return initial zeroed state
    const result: DeptAggregate = aggregate ?? {
      orgId: session.orgId,
      deptId,
      period,
      workerCount: 0,
      assessmentsPassed: 0,
      assessmentsFailed: 0,
      skillGaps: {},
    };

    return NextResponse.json({ aggregate: result });
  } catch (error) {
    return handleApiError(error);
  }
}
