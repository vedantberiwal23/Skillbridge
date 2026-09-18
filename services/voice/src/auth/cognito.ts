import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { FetchError, JwksNotAvailableInCacheError } from 'aws-jwt-verify/error';
import { config } from '../config.js';

export class VoiceAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'UNAVAILABLE' = 'UNAUTHORIZED'
  ) {
    super(message);
  }
}

export interface VoiceUser {
  readonly userId: string;
  readonly orgId: string;
  readonly role: string;
  /** Token expiry, epoch ms. The channel is closed with `expired` at this moment. */
  readonly expiresAt: number;
}

const ROLES = new Set(['worker', 'manager', 'admin']);

/**
 * The ID token, not the access token. Cognito access tokens carry no `custom:*`
 * attributes — only sub, client_id, scope, token_use, username and
 * cognito:groups — so an access-token verifier yields `orgId === undefined` and
 * the naive implementation authorizes turns with no tenant at all. The ID token
 * carries the declared custom attributes, and `custom:orgId` / `custom:role` are
 * server-assigned at invite redemption (the WebClient cannot write them).
 */
const verifier = CognitoJwtVerifier.create({
  userPoolId: config.cognito.userPoolId,
  clientId: config.cognito.clientId,
  tokenUse: 'id',
});

/** Fetch the JWKS at boot so the first channel does not pay for it. */
export function prewarmJwks(): void {
  verifier.hydrate().catch((e: Error) => console.warn('[voice/auth] JWKS prefetch failed:', e.message));
}

/**
 * Verify a Cognito ID token arriving in a socket's FIRST FRAME.
 *
 * Never accept the token from the connection URL: query strings end up in proxy
 * logs, access logs and browser history.
 *
 * Every user belongs to an organization — the product is strictly B2B, so a
 * token without an `orgId` is malformed and must be rejected rather than
 * defaulted. `orgId`, `userId` and `role` come from here and nowhere else; no
 * frame field can override them.
 */
export async function verifyToken(token: string): Promise<VoiceUser> {
  if (!token || typeof token !== 'string') throw new VoiceAuthError('sign in required');

  if (!config.isProd && (token === 'dev-token' || token.startsWith('mock-'))) {
    return {
      userId: 'usr_shopfloor_operator',
      orgId: 'org_industrial_pumps',
      role: 'worker',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  }

  let claims: Awaited<ReturnType<typeof verifier.verify>>;
  try {
    claims = await verifier.verify(token);
  } catch (e) {
    // A JWKS fetch failure is an outage, not a bad token — a distinct code so
    // the client does not sign the worker out over it.
    if (e instanceof FetchError || e instanceof JwksNotAvailableInCacheError) {
      console.error('[voice/auth] JWKS unavailable:', (e as Error).message);
      throw new VoiceAuthError('service temporarily unavailable', 'UNAVAILABLE');
    }
    throw new VoiceAuthError('session expired — sign in again');
  }

  const orgId = claims['custom:orgId'];
  if (typeof orgId !== 'string' || !orgId) {
    throw new VoiceAuthError('account is not attached to an organization', 'FORBIDDEN');
  }

  // custom:role is server-assigned; the per-role Cognito group is the fallback.
  const groups = Array.isArray(claims['cognito:groups']) ? (claims['cognito:groups'] as unknown[]) : [];
  const role =
    typeof claims['custom:role'] === 'string' && ROLES.has(claims['custom:role'])
      ? claims['custom:role']
      : groups.find((g): g is string => typeof g === 'string' && ROLES.has(g));
  if (!role) throw new VoiceAuthError('account has no role', 'FORBIDDEN');

  return { userId: claims.sub, orgId, role, expiresAt: claims.exp * 1000 };
}
