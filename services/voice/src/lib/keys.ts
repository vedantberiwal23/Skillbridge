// Vendored VERBATIM from web/src/lib/keys.ts — services/voice has no shared
// package, and a drifted key literal writes items nothing reads back. Re-copy
// the whole file when the original changes; do not edit it here.

/**
 * Single-table key builders. Full rationale in DATA-MODEL.md.
 *
 * Partitioning splits by WRITE VOLUME, not by tenant:
 *   USER#<userId>  high-volume, worker-owned — progress, attempts, events
 *   ORG#<orgId>    low-volume config and content — departments, docs, lessons
 *
 * Putting worker events under the org partition would cap an entire workforce on
 * one partition's throughput.
 */

export const orgPk = (orgId: string) => `ORG#${orgId}`;
export const userPk = (userId: string) => `USER#${userId}`;

export const keys = {
  org: (orgId: string) => ({ PK: orgPk(orgId), SK: 'META' }),
  subscription: (orgId: string) => ({ PK: orgPk(orgId), SK: 'SUB' }),
  department: (orgId: string, deptId: string) => ({
    PK: orgPk(orgId),
    SK: `DEPT#${deptId}`,
  }),
  invite: (orgId: string, code: string) => ({
    PK: orgPk(orgId),
    SK: `INVITE#${code}`,
  }),
  doc: (orgId: string, docId: string) => ({ PK: orgPk(orgId), SK: `DOC#${docId}` }),
  lesson: (orgId: string, lessonId: string) => ({
    PK: orgPk(orgId),
    SK: `LESSON#${lessonId}`,
  }),
  assessment: (orgId: string, assessmentId: string) => ({
    PK: orgPk(orgId),
    SK: `ASMT#${assessmentId}`,
  }),
  asset: (orgId: string, assetId: string) => ({
    PK: orgPk(orgId),
    SK: `ASSET#${assetId}`,
  }),
  deptAggregate: (orgId: string, deptId: string, period: string) => ({
    PK: orgPk(orgId),
    SK: `AGG#DEPT#${deptId}#${period}`,
  }),

  profile: (userId: string) => ({ PK: userPk(userId), SK: 'PROFILE' }),
  settings: (userId: string) => ({ PK: userPk(userId), SK: 'SETTINGS' }),
  plan: (userId: string, planId: string) => ({
    PK: userPk(userId),
    SK: `PLAN#${planId}`,
  }),
  // seq is zero-padded because sort keys compare lexicographically: an unpadded
  // MOD#10 sorts before MOD#2, so any plan with ten or more modules comes back
  // out of order and the worker is shown module 10 before module 2.
  planModule: (userId: string, planId: string, seq: number) => ({
    PK: userPk(userId),
    SK: `PLAN#${planId}#MOD#${String(seq).padStart(3, '0')}`,
  }),
  attempt: (userId: string, assessmentId: string, ts: string) => ({
    PK: userPk(userId),
    SK: `ATTEMPT#${assessmentId}#${ts}`,
  }),
  badge: (userId: string, badgeId: string) => ({
    PK: userPk(userId),
    SK: `BADGE#${badgeId}`,
  }),
  skillProfile: (userId: string) => ({
    PK: userPk(userId),
    SK: 'SKILLPROFILE#CURRENT',
  }),
  event: (userId: string, ts: string, id: string) => ({
    PK: userPk(userId),
    SK: `EVT#${ts}#${id}`,
  }),
  session: (userId: string, ts: string, sessionId: string) => ({
    PK: userPk(userId),
    SK: `SESSION#${ts}#${sessionId}`,
  }),

  /**
   * The RAG cache gets its own partition rather than a slot under the org: it is
   * written on every cache miss across the whole workforce, which is exactly the
   * write pattern the org partition must stay free of.
   */
  ragCache: (orgId: string, questionHash: string, kbVersion: string) => ({
    PK: `CACHE#${orgId}#${questionHash}`,
    SK: `KB#${kbVersion}`,
  }),
};

/** GSI1 — org directory. begins_with on the sort key serves org / dept / role. */
export const gsi1 = {
  pk: (orgId: string) => orgPk(orgId),
  sk: (deptId: string | null, role: string, userId: string) =>
    `DEPT#${deptId ?? 'NONE'}#ROLE#${role}#USER#${userId}`,
  deptPrefix: (deptId: string) => `DEPT#${deptId}#`,
  deptRolePrefix: (deptId: string, role: string) => `DEPT#${deptId}#ROLE#${role}#`,
};

/** GSI2 — invite redemption starts with only the code; the org is unknown then. */
export const gsi2 = {
  invitePk: (code: string) => `INVITE#${code}`,
  sk: (orgId: string) => orgPk(orgId),
};

/** Raw events are profiler input, not a permanent record. */
export const EVENT_TTL_DAYS = 90;

export const eventTtl = (now = Date.now()) =>
  Math.floor(now / 1000) + EVENT_TTL_DAYS * 24 * 60 * 60;
