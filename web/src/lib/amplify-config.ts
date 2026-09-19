import type { ResourcesConfig } from 'aws-amplify';

/**
 * Shared by the client provider (amplify.ts) and the server runner (auth.ts).
 * Kept in one place so the two cannot drift onto different pools.
 */
export const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '',
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '',
    },
  },
};
