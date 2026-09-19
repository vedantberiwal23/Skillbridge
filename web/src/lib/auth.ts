import { headers, cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { Role, ROLES } from './types';
import { ddb, TABLE_NAME } from './ddb';
import { keys } from './keys';
import { USER_POOL_ID, CLIENT_ID } from './cognito';
import { ValidationError } from './validation';

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface SessionUser {
  userId: string;
  orgId: string;
  role: Role;
  deptId: string | null;
}

// Lazy verifiers for ID and access tokens (allows next build to run when env vars are unset)
let idVerifierInstance: ReturnType<typeof CognitoJwtVerifier.create> | null = null;
let accessVerifierInstance: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

/**
 * `aws-jwt-verify` only skips the client-id check when `clientId` is explicitly
 * `null`. An empty string is *checked* — and fails every token — so an unset env
 * var would surface as "invalid or expired token" on every request rather than
 * as the configuration error it actually is.
 */
function assertConfigured() {
  if (!USER_POOL_ID) {
    throw new AuthError('Cognito User Pool ID not configured', 500);
  }
  if (!CLIENT_ID) {
    throw new AuthError('Cognito Client ID not configured', 500);
  }
}

function getIdVerifier() {
  if (!idVerifierInstance) {
    assertConfigured();
    idVerifierInstance = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      clientId: CLIENT_ID,
      tokenUse: 'id',
    });
  }
  return idVerifierInstance;
}

function getAccessVerifier() {
  if (!accessVerifierInstance) {
    assertConfigured();
    accessVerifierInstance = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      clientId: CLIENT_ID,
      tokenUse: 'access',
    });
  }
  return accessVerifierInstance;
}

const rank = (role: Role) => ROLES.indexOf(role);

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/**
 * Cognito group membership is a set, not a list — its order carries no meaning,
 * so taking `groups[0]` would resolve a user in both `worker` and `manager` to
 * whichever the token happened to list first. Resolve the highest privilege the
 * user actually holds instead.
 */
function roleFromGroups(groups: unknown): Role | undefined {
  if (!Array.isArray(groups)) return undefined;
  let best: Role | undefined;
  for (const group of groups) {
    if (isRole(group) && (best === undefined || rank(group) > rank(best))) {
      best = group;
    }
  }
  return best;
}

/**
 * Extract raw JWT token string from Authorization header or Amplify cookies.
 * Safely handles calls inside and outside Next.js request context.
 */
async function extractToken(req?: Request): Promise<string | null> {
  if (req) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
  }

  try {
    const reqHeaders = await headers();
    const authHeader = reqHeaders.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
  } catch {
    // Outside Next.js request store (e.g. unit test runner)
  }

  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();

    const idTokenCookie = allCookies.find((c) => c.name.endsWith('.idToken'));
    if (idTokenCookie && idTokenCookie.value) {
      return idTokenCookie.value;
    }

    const accessTokenCookie = allCookies.find((c) => c.name.endsWith('.accessToken'));
    if (accessTokenCookie && accessTokenCookie.value) {
      return accessTokenCookie.value;
    }
  } catch {
    // Outside Next.js request store
  }

  return null;
}

/**
 * Server-side session verification. Strictly follows CLAUDE.md:
 * - orgId, userId and role come ONLY from verified Cognito claims (or the
 *   DynamoDB profile keyed by the verified `sub`).
 * - Never from request body, query string, path segment or client-set header.
 * - Rejects a token carrying no orgId; never defaults or synthesizes one.
 * - Verifies the ID token first, since the access token carries no `custom:*`.
 */
export async function requireSession(
  requiredRole?: Role,
  req?: Request
): Promise<SessionUser> {
  const token = await extractToken(req);
  if (!token) {
    throw new AuthError('Missing authentication token', 401);
  }

  let sub: string;
  let orgId: string | undefined;
  let role: Role | undefined;
  let deptId: string | null = null;

  try {
    // Try ID token first
    const verifier = getIdVerifier();
    const payload = await verifier.verify(token);
    sub = payload.sub;
    orgId = (payload['custom:orgId'] as string | undefined) || undefined;
    const claimedRole = payload['custom:role'];
    role = isRole(claimedRole) ? claimedRole : roleFromGroups(payload['cognito:groups']);
    deptId = (payload['custom:deptId'] as string | undefined) || null;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    try {
      // Fallback: verify access token
      const accVerifier = getAccessVerifier();
      const accessPayload = await accVerifier.verify(token);
      sub = accessPayload.sub;
      role = roleFromGroups(accessPayload['cognito:groups']);
    } catch (innerErr) {
      if (innerErr instanceof AuthError) throw innerErr;
      throw new AuthError('Invalid or expired authentication token', 401);
    }
  }

  // If orgId is not present in token claims, fetch from DynamoDB USER#<sub> / PROFILE
  if (!orgId || !role) {
    if (!TABLE_NAME) {
      throw new AuthError('Database table not configured', 500);
    }
    const profileRes = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: keys.profile(sub),
      })
    );

    const profile = profileRes.Item;
    if (!profile || !profile.orgId) {
      throw new AuthError('User profile not found or missing tenant', 401);
    }

    orgId = profile.orgId as string;
    role = role ?? (isRole(profile.role) ? profile.role : undefined);
    deptId = deptId ?? ((profile.deptId as string | null) ?? null);
  }

  if (!orgId) {
    throw new AuthError('Malformed token: missing orgId', 401);
  }
  if (!role) {
    throw new AuthError('Malformed token: missing role', 401);
  }

  // Role authorization check. ROLES is ordered least- to most-privileged, so an
  // admin satisfies a manager requirement and a manager satisfies a worker one.
  if (requiredRole && rank(role) < rank(requiredRole)) {
    throw new AuthError(`Forbidden: requires role '${requiredRole}'`, 403);
  }

  return {
    userId: sub,
    orgId,
    role,
    deptId,
  };
}

/**
 * Render an error for an API route.
 *
 * Only messages this code raised deliberately reach the client. An unexpected
 * failure is logged server-side and answered generically, because the raw
 * message is routinely a Cognito or DynamoDB error naming internal resources.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: error.message, issues: error.issues },
      { status: 400 }
    );
  }

  console.error('API Error:', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}

/**
 * Where each role lands when it arrives at `/`.
 *
 * Kept here rather than in the page so the group layouts can bounce a user who
 * reaches the wrong section to their own home instead of to a dead end. Route
 * groups add no URL segment, so `/plan`, `/dashboard` and `/users` share one
 * flat namespace that any signed-in user can type — this map is the UX half of
 * that; the enforcement boundary is still the route handler.
 */
export const HOME_FOR_ROLE: Record<Role, string> = {
  worker: '/plan',
  manager: '/dashboard',
  admin: '/users',
};

/**
 * The non-throwing counterpart to `requireSession`, for pages that must render
 * *something* either way rather than fail.
 *
 * Use it only where "signed out" is a legitimate outcome — the root route, a
 * public landing page. Anything that reads tenant data uses `requireSession`,
 * which rejects rather than returning null, so a missing session can never be
 * mistaken for an empty result.
 */
export async function getSession(): Promise<SessionUser | null> {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}
