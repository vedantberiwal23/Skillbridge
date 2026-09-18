import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Role } from './types';

export const USER_POOL_ID =
  process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ??
  process.env.COGNITO_USER_POOL_ID ??
  '';

export const CLIENT_ID =
  process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ??
  process.env.COGNITO_CLIENT_ID ??
  '';

export const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.NEXT_PUBLIC_AWS_REGION ?? 'ap-northeast-1',
});

export interface ProvisionUserParams {
  username: string;
  password: string;
  name: string;
  orgId: string;
  deptId: string | null;
  role: Role;
  email?: string;
  phone?: string;
}

/**
 * Server-side user provisioning during invite redemption.
 *
 * Strictly follows CLAUDE.md / BACKEND.md:
 * 1. AdminCreateUser with MessageAction: SUPPRESS (invite already carried code)
 * 2. AdminAddUserToGroup
 * 3. AdminSetUserPassword with Permanent: true (otherwise signIn returns challenge)
 */
export async function provisionCognitoUser(params: ProvisionUserParams): Promise<{ sub: string }> {
  const { username, password, name, orgId, deptId, role, email, phone } = params;

  const userAttributes = [
    { Name: 'name', Value: name },
    { Name: 'custom:orgId', Value: orgId },
    { Name: 'custom:deptId', Value: deptId ?? '' },
    { Name: 'custom:role', Value: role },
  ];

  if (email) {
    userAttributes.push(
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' }
    );
  }

  if (phone) {
    userAttributes.push(
      { Name: 'phone_number', Value: phone },
      { Name: 'phone_number_verified', Value: 'true' }
    );
  }

  // 1. AdminCreateUser with SUPPRESS
  const createRes = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      MessageAction: 'SUPPRESS',
      UserAttributes: userAttributes,
    })
  );

  const sub = createRes.User?.Attributes?.find((attr) => attr.Name === 'sub')?.Value;
  if (!sub) {
    throw new Error('Failed to retrieve sub from created Cognito user');
  }

  // 2. AdminAddUserToGroup
  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: role,
    })
  );

  // 3. AdminSetUserPassword with Permanent: true
  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      Password: password,
      Permanent: true,
    })
  );

  return { sub };
}
