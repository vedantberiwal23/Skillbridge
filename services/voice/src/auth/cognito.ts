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
    const role =
      (payload['custom:role'] as string | undefined) ||
      (payload['cognito:groups'] as string[] | undefined)?.[0] ||
      'worker';

    if (!orgId) {
      throw new VoiceAuthError('Token missing custom:orgId attribute', 'UNAUTHORIZED');
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
    const message = err instanceof Error ? err.message : 'Invalid token';
    throw new VoiceAuthError(message, 'UNAUTHORIZED');
  }
}
