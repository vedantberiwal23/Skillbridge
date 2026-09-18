import { headers, cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { Role } from './types';
import { ddb, TABLE_NAME } from './ddb';
import { keys } from './keys';
import { USER_POOL_ID, CLIENT_ID } from './cognito';

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

function getIdVerifier() {
  if (!idVerifierInstance) {
    if (!USER_POOL_ID) {
      throw new AuthError('Cognito User Pool ID not configured', 500);
    }
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
    if (!USER_POOL_ID) {
      throw new AuthError('Cognito User Pool ID not configured', 500);
    }
    accessVerifierInstance = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      clientId: CLIENT_ID,
      tokenUse: 'access',
    });
  }
  return accessVerifierInstance;
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

    const accessTokenCookie = allCookies.find(
      (c) => c.name.endsWith('.accessToken') || c.name === 'idToken' || c.name === 'token'
    );
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
 * - orgId, userId and role come ONLY from verified Cognito claims (or DynamoDB profile fallback).
 * - Never from request body, query string, path segment or client-set header.
 * - Rejects a token carrying no orgId; never defaults or synthesizes one.
 * - Verifies ID Token first (which carries custom:* attributes free).
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
    orgId = payload['custom:orgId'] as string | undefined;
    role = (payload['custom:role'] as Role) || (payload['cognito:groups']?.[0] as Role);
    deptId = (payload['custom:deptId'] as string) || null;
  } catch {
    try {
      // Fallback: verify access token
      const accVerifier = getAccessVerifier();
      const accessPayload = await accVerifier.verify(token);
      sub = accessPayload.sub;
      const groups = accessPayload['cognito:groups'];
      if (groups && groups.length > 0) {
        role = groups[0] as Role;
      }
    } catch {
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

    orgId = profile.orgId;
    role = role ?? (profile.role as Role);
    deptId = deptId ?? profile.deptId ?? null;
  }

  if (!orgId) {
    throw new AuthError('Malformed token: missing orgId', 401);
  }

  // Role authorization check
  if (requiredRole) {
    const isAuthorized =
      role === requiredRole ||
      (requiredRole === 'worker' && (role === 'manager' || role === 'admin')) ||
      (requiredRole === 'manager' && role === 'admin');

    if (!isAuthorized) {
      throw new AuthError(`Forbidden: requires role '${requiredRole}'`, 403);
    }
  }

  return {
    userId: sub,
    orgId,
    role: role as Role,
    deptId,
  };
}

/**
 * Helper to handle auth errors in Next.js API route handlers.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  const message = error instanceof Error ? error.message : 'Internal Server Error';
  console.error('API Error:', error);
  return NextResponse.json({ error: message }, { status: 500 });
}
