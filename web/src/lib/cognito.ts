import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Role } from './types';

export const USER_POOL_ID =
  process.env.COGNITO_USER_POOL_ID ??
  process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ??
  '';

export const CLIENT_ID =
  process.env.COGNITO_CLIENT_ID ??
  process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ??
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
 *
 * Steps 2 and 3 can fail after step 1 has already created the account, which
 * would leave a user with no group or stuck in FORCE_CHANGE_PASSWORD and make
 * every retry fail with UsernameExistsException. On any failure after creation
 * the half-provisioned account is removed so the caller can release the invite
 * and the worker can try again.
 */
export async function provisionCognitoUser(
  params: ProvisionUserParams
): Promise<{ sub: string }> {
  const { username, password, name, orgId, deptId, role, email, phone } = params;

  const userAttributes = [
    { Name: 'name', Value: name },
    { Name: 'custom:orgId', Value: orgId },
    { Name: 'custom:role', Value: role },
  ];

  // Omitted rather than written as '' when the admin has not placed the worker
  // in a department yet. `gsi1.sk` carries the DEPT#NONE sentinel for that case;
  // the claim itself is simply absent.
  if (deptId) {
    userAttributes.push({ Name: 'custom:deptId', Value: deptId });
  }

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
    await deleteCognitoUser(username);
    throw new Error('Failed to retrieve sub from created Cognito user');
  }

  try {
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
  } catch (err) {
    await deleteCognitoUser(username);
    throw err;
  }

  return { sub };
}

/**
 * Best-effort removal of a partially provisioned account. Never throws: it runs
 * inside a failure path whose original error is the one worth surfacing.
 */
export async function deleteCognitoUser(username: string): Promise<void> {
  try {
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );
  } catch (err) {
    console.error('Failed to clean up partially provisioned Cognito user:', err);
  }
}

/**
 * Keep the `custom:deptId` claim in step after a person is moved between
 * departments. The PROFILE item is the source of truth for the directory; this
 * only stops the claim going stale at the next token refresh.
 *
 * The pool signs in by email or phone, so every account's username is its sub,
 * which is what the directory holds. Best-effort: a failure is logged, not
 * thrown, because the move itself has already been committed.
 */
export async function updateCognitoDept(sub: string, deptId: string): Promise<void> {
  try {
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: sub,
        UserAttributes: [{ Name: 'custom:deptId', Value: deptId }],
      })
    );
  } catch (err) {
    console.error('Could not update custom:deptId after a department move:', err);
  }
}
