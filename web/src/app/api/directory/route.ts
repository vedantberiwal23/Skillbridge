import { NextRequest, NextResponse } from 'next/server';

import { requireSession, handleApiError } from '@/lib/auth';
import { queryDirectory } from '@/lib/directory';
import { prefixes } from '@/lib/keys';

/**
 * GET /api/directory — everyone in the organization (admin only).
 *
 * One paged GSI1 Query over the org partition: the index exists for exactly
 * this listing. Returns profile fields and role/department, nothing computed.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession('admin', req);
    const { entries, truncated } = await queryDirectory(session.orgId, prefixes.department);
    return NextResponse.json({ people: entries, truncated });
  } catch (error) {
    return handleApiError(error);
  }
}
