import { CognitoJwtVerifier } from 'aws-jwt-verify';
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
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: config.cognito.userPoolId,
  clientId: config.cognito.clientId,
  tokenUse: 'id',
});

/**
 * Ordered least- to most-privileged, mirroring the groups AuthStack creates and
 * `web/src/lib/types.ts`. Vendored rather than imported: this service is its own
 * deployable and shares no module graph with the web app.
 */
const ROLES = ['worker', 'manager', 'admin'] as const;

type KnownRole = (typeof ROLES)[number];

const isRole = (value: unknown): value is KnownRole =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/**
 * Group membership is a set — its order means nothing, so `groups[0]` would
 * resolve a user in both `worker` and `manager` to whichever came first in the
 * token. Take the highest privilege actually held.
 */
function roleFromGroups(groups: unknown): KnownRole | undefined {
  if (!Array.isArray(groups)) return undefined;
  let best: KnownRole | undefined;
  for (const group of groups) {
    if (isRole(group) && (best === undefined || ROLES.indexOf(group) > ROLES.indexOf(best))) {
      best = group;
    }
  }
  return best;
}

/**
 * Verify a Cognito ID token arriving in a socket's FIRST FRAME.
 *
 * Never accept the token from the connection URL: query strings end up in proxy
 * logs, access logs and browser history.
 *
 * Every user belongs to an organization — the product is strictly B2B, so a
 * token without an `orgId` is malformed and must be rejected rather than
 * defaulted.
 */
export async function verifyToken(token: string): Promise<VoiceUser> {
  try {
    const payload = await verifier.verify(token);
    const userId = payload.sub;
    const orgId = payload['custom:orgId'] as string | undefined;

    const claimedRole = payload['custom:role'];
    const role = isRole(claimedRole)
      ? claimedRole
      : roleFromGroups(payload['cognito:groups']);

    if (!orgId) {
      throw new VoiceAuthError('Token missing custom:orgId attribute', 'UNAUTHORIZED');
    }
    // Defaulting an absent role to 'worker' would authorize a turn for a token
    // that never carried one. AuthStack puts every provisioned user in a group,
    // so a token with no role is malformed — reject it, as with orgId.
    if (!role) {
      throw new VoiceAuthError('Token missing role claim', 'UNAUTHORIZED');
    }

    return {
      userId,
      orgId,
      role,
    };
  } catch (err) {
    if (err instanceof VoiceAuthError) {
      throw err;
    }
    // The underlying message names JWKS urls, claim names and pool ids. Log it
    // for the operator; tell the client only that the token was rejected.
    console.error('Token verification failed:', err);
    throw new VoiceAuthError('Invalid token', 'UNAUTHORIZED');
  }
}
