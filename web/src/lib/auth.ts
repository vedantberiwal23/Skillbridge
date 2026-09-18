// Server-only: importing `next/headers` is a build error in a client component,
// so this module cannot be pulled into the browser bundle.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { amplifyConfig } from './amplify-config';
import { ddb, TABLE_NAME } from './ddb';
import { keys } from './keys';
import type { Role } from './types';

export const { runWithAmplifyServerContext } = createServerRunner({
  config: amplifyConfig,
});

export interface Session {
  userId: string;
  orgId: string;
  role: Role;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const ROLES: readonly Role[] = ['worker', 'manager', 'admin'];

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/**
 * The one server-side session resolver. Every route handler and every group
 * layout goes through this — `orgId` is the only tenant boundary in the design,
 * so a second, subtly different resolver is a cross-tenant read waiting to happen.
 *
 * Two claims are deliberately NOT trusted from the token:
 *
 *   role   — taken from `cognito:groups`, not `custom:role`. AuthStack creates a
 *            group per role, and group membership is not self-assignable.
 *   orgId  — loaded from USER#<sub>/PROFILE, not `custom:orgId`. The WebClient
 *            app client sets no writeAttributes allowlist, and all seven custom
 *            attributes are mutable — so today a signed-in worker can call
 *            updateUserAttributes({'custom:orgId': '<other org>'}). Until that
 *            allowlist lands in auth-stack.ts, a custom attribute is caller-
 *            supplied data, not a claim.
 *
 * Never accept any of these three from a body, query string, path segment or
 * header — not even temporarily.
 */
export async function requireSession(role?: Role): Promise<Session> {
  const preview = await devPreviewSession();
  if (preview) {
    if (role && preview.role !== role) throw new AuthError(`Requires ${role}`, 403);
    return preview;
  }

  const session = await runWithAmplifyServerContext({
    nextServerContext: { cookies },
    operation: (contextSpec) => fetchAuthSession(contextSpec),
  }).catch(() => null);

  const idToken = session?.tokens?.idToken;
  if (!idToken) throw new AuthError('Not signed in', 401);

  const userId = idToken.payload.sub;
  if (!userId) throw new AuthError('Token carries no subject', 401);

  const groups = idToken.payload['cognito:groups'];
  const callerRole = Array.isArray(groups)
    ? ROLES.find((r) => groups.includes(r))
    : undefined;
  if (!isRole(callerRole)) throw new AuthError('Token carries no role group', 403);

  const orgId = await loadOrgId(userId);
  // Never default or synthesise a tenant. A profile with no orgId is a broken
  // provisioning record, not a user who should read something.
  if (!orgId) throw new AuthError('No organization for this user', 403);

  if (role && callerRole !== role) {
    throw new AuthError(`Requires ${role}`, 403);
  }

  return { userId, orgId, role: callerRole };
}

/**
 * Dev-only preview session. Synthesises a session so the worker spine can be
 * walked before the Cognito pool exists.
 *
 * This is the one place in the codebase that invents a session, and it is
 * double-gated so it cannot reach production:
 *
 *   1. NODE_ENV !== 'production' — `next build` sets this to 'production', so a
 *      production bundle takes the real path no matter what is in the env.
 *   2. DEV_PREVIEW_ROLE must be set explicitly — it is off even in dev unless
 *      someone opts in, and it is a server-side var, so it is never inlined
 *      into client JS.
 *
 * It is also loud: every use logs. If you see this line anywhere but your own
 * machine, something is wrong.
 *
 * Delete this function once AuthStack is deployed and a test user exists.
 */
async function devPreviewSession(): Promise<Session | null> {
  if (process.env.NODE_ENV === 'production') return null;

  const cookieStore = await cookies();
  const devCookie = cookieStore.get('dev_role')?.value;
  const role = isRole(devCookie) ? devCookie : process.env.DEV_PREVIEW_ROLE;
  if (!isRole(role)) return null;

  console.warn(
    `[auth] DEV PREVIEW SESSION ACTIVE — role="${role}". Not a real session. Never in production.`
  );

  return {
    userId: process.env.DEV_PREVIEW_USER_ID ?? 'user-demo',
    orgId: process.env.DEV_PREVIEW_ORG_ID ?? 'org-demo',
    role,
  };
}

async function loadOrgId(userId: string): Promise<string | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.profile(userId),
      ProjectionExpression: 'orgId',
    })
  );
  const orgId = result.Item?.orgId;
  return typeof orgId === 'string' && orgId.length > 0 ? orgId : null;
}

/** Non-throwing variant, for entry points that redirect rather than error. */
export async function getSession(): Promise<Session | null> {
  return requireSession().catch(() => null);
}

export const HOME_FOR_ROLE: Record<Role, string> = {
  worker: '/home',
  manager: '/dashboard',
  admin: '/users',
};

/**
 * Role gating for group layouts. This is UX only — route groups add no URL
 * segment, so /plan, /dashboard and /users share one flat namespace that any
 * signed-in user can type. The enforcement boundary is the route handler.
 */
export async function gatePage(role: Role): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== role) redirect(HOME_FOR_ROLE[session.role]);
  return session;
}
