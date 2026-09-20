import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { QueryCommand, UpdateCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { keys, gsi1, gsi2 } from '@/lib/keys';
import { requireSession, handleApiError, AuthError } from '@/lib/auth';
import { provisionCognitoUser, deleteCognitoUser } from '@/lib/cognito';
import { parseBody, issueInviteSchema, redeemInviteSchema } from '@/lib/validation';
import { Role } from '@/lib/types';
import { DEFAULT_LOCALE } from '@/i18n/config';
import { getDepartment } from '@/lib/scope';

/** 8 bytes -> 16 hex characters. The code is the only credential guarding an
 *  unauthenticated endpoint that creates accounts, so it is sized to be
 *  infeasible to guess while still being readable out of an SMS. */
const INVITE_CODE_BYTES = 8;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /api/invites — Admin issues an invite (Pattern A3).
 *
 * Scoped to admin only. Generates a secure code, sets expiry, and records
 * the invite under the tenant's ORG# partition and GSI2 for redemption lookup.
 *
 * CRITICAL (CLAUDE.md):
 * Do NOT set redeemedAt: null. `ddb.ts` sets removeUndefinedValues, which strips
 * undefined but preserves null — so a null here would make the attribute exist,
 * `attribute_not_exists(redeemedAt)` would never fail, and one code would redeem
 * an unlimited number of times. Omit it entirely at issue time.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession('admin', req);
    const body = parseBody(issueInviteSchema, await req.json());

    // An invite into a department that does not exist in this org would land the
    // person in a deptId no screen can show.
    if (body.deptId && !(await getDepartment(session.orgId, body.deptId))) {
      throw new AuthError('That department does not exist in your organization', 400);
    }

    const code = crypto.randomBytes(INVITE_CODE_BYTES).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    const inviteKey = keys.invite(session.orgId, code);
    const item = {
      PK: inviteKey.PK,
      SK: inviteKey.SK,
      GSI2PK: gsi2.invitePk(code),
      GSI2SK: gsi2.sk(session.orgId),
      orgId: session.orgId,
      code,
      deptId: body.deptId ?? null,
      role: body.role as Role,
      channel: body.channel,
      phone: body.phone ?? null,
      email: body.email ?? null,
      createdAt: new Date().toISOString(),
      expiresAt,
      // Notice: redeemedAt is omitted entirely here
    };

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );

    return NextResponse.json({ invite: item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Hand a burnt invite back so the worker can retry after a failed provisioning. */
async function releaseInvite(orgId: string, code: string) {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: keys.invite(orgId, code),
        UpdateExpression: 'REMOVE redeemedAt',
      })
    );
  } catch (err) {
    console.error('Failed to release invite after a failed redemption:', err);
  }
}

/** Cognito rejections that are the caller's fault, not ours. */
function mapProvisioningError(error: unknown): AuthError | null {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'UsernameExistsException':
      return new AuthError('An account already exists for this phone or email', 409);
    case 'InvalidPasswordException':
      return new AuthError('Password does not meet the required policy', 400);
    case 'InvalidParameterException':
      return new AuthError('Phone number or email is not in a valid format', 400);
    default:
      return null;
  }
}

/**
 * PATCH /api/invites — Redeem an invite by code (Pattern A4).
 *
 * Public endpoint: the worker has no account yet, so there is no session to
 * require. The invite code is the credential.
 *
 * Strictly follows the redemption sequence from CLAUDE.md:
 * 1. GSI2 lookup on INVITE#<code> to find the invite and its orgId.
 * 2. Conditional UpdateItem on ORG#<orgId> / INVITE#<code> marking redeemedAt,
 *    guarded on not-already-redeemed AND expiresAt.
 * 3. Only then create the Cognito user. orgId/deptId/role are copied from the
 *    stored invite, NEVER from the request body.
 * 4. Write USER#<sub>/PROFILE (with GSI1) and USER#<sub>/SETTINGS.
 *
 * Everything after step 2 can fail, and a failure there would otherwise burn the
 * worker's only route into the product. Each later step releases the invite on
 * the way out so the redemption can be retried.
 */
export async function PATCH(req: NextRequest) {
  try {
    // Validated BEFORE the invite is marked redeemed: a password that misses the
    // pool policy or a phone that is not E.164 is rejected by Cognito in step 3,
    // by which point the code would already have been consumed.
    const body = parseBody(redeemInviteSchema, await req.json());
    const { code, name, password, phone, email } = body;

    // The pool uses UsernameAttributes ["email", "phone_number"], so the username
    // must itself be the phone or email. Phone is preferred: most of this
    // workforce has no domain email address.
    const username = phone ?? email;
    if (!username) {
      throw new AuthError('A phone number or email is required', 400);
    }

    // 1. GSI2 lookup on INVITE#<code> — the org is unknown at this point
    const normalizedCode = code.trim().toUpperCase();
    const gsi2Res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': gsi2.invitePk(normalizedCode),
        },
      })
    );

    const matches = gsi2Res.Items ?? [];
    if (matches.length === 0) {
      return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
    }
    if (matches.length > 1) {
      // Two orgs holding one code would make "which tenant" ambiguous. Refuse
      // rather than pick.
      console.error('Invite code collision across organizations:', normalizedCode);
      return NextResponse.json({ error: 'Invite code is not usable' }, { status: 409 });
    }

    const invite = matches[0];

    /**
     * The code was issued to one phone or one email. Without this check, anyone
     * who sees the link — forwarded, screenshotted, read off a shoulder — can
     * claim it with their own number and join the organization.
     */
    const issuedPhone = (invite.phone as string | null) ?? null;
    const issuedEmail = (invite.email as string | null) ?? null;
    const claimedPhone = phone ?? null;
    const claimedEmail = email ? email.toLowerCase() : null;
    const mismatch =
      (issuedPhone && issuedPhone !== claimedPhone) ||
      (issuedEmail && issuedEmail.toLowerCase() !== claimedEmail);
    if (mismatch) {
      return NextResponse.json(
        { error: 'This invite was sent to a different phone number or email' },
        { status: 403 }
      );
    }

    const orgId = invite.orgId as string;
    const inviteRole = invite.role as Role;
    const inviteDeptId = (invite.deptId as string | null) ?? null;

    // 2. Conditional UpdateItem — guards redemption and expiry atomically, so
    //    two simultaneous redemptions of one code cannot both win.
    const now = new Date().toISOString();
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: keys.invite(orgId, invite.code as string),
          ConditionExpression: 'attribute_not_exists(redeemedAt) AND expiresAt > :now',
          UpdateExpression: 'SET redeemedAt = :now',
          ExpressionAttributeValues: { ':now': now },
        })
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        return NextResponse.json(
          { error: 'Invite code is invalid, already redeemed, or expired' },
          { status: 400 }
        );
      }
      throw err;
    }

    // 3. Create the Cognito user with tenant attributes taken from the invite
    let sub: string;
    try {
      ({ sub } = await provisionCognitoUser({
        username,
        password,
        name,
        orgId, // from the stored invite, NEVER from the request
        deptId: inviteDeptId,
        role: inviteRole,
        email,
        phone,
      }));
    } catch (err) {
      await releaseInvite(orgId, invite.code as string);
      const mapped = mapProvisioningError(err);
      if (mapped) throw mapped;
      throw err;
    }

    // 4. PROFILE and SETTINGS, written together — a user with a profile but no
    //    settings would break onboarding with no obvious cause.
    const profileKey = keys.profile(sub);
    const settingsKey = keys.settings(sub);

    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: TABLE_NAME,
                Item: {
                  ...profileKey,
                  userId: sub,
                  orgId,
                  deptId: inviteDeptId,
                  role: inviteRole,
                  name,
                  profession: null,
                  skillLevel: null,
                  // GSI1 is sparse: these two attributes go on the PROFILE item
                  // and on no other item type.
                  GSI1PK: gsi1.pk(orgId),
                  GSI1SK: gsi1.sk(inviteDeptId, inviteRole, sub),
                },
              },
            },
            {
              Put: {
                TableName: TABLE_NAME,
                Item: {
                  ...settingsKey,
                  userId: sub,
                  orgId,
                  language: DEFAULT_LOCALE,
                  learningMode: 'speech',
                  accessibilityMode: false,
                },
              },
            },
          ],
        })
      );
    } catch (err) {
      // The account exists but has no application record, so it cannot be used.
      // Remove it and hand the invite back rather than stranding the worker.
      await deleteCognitoUser(username);
      await releaseInvite(orgId, invite.code as string);
      throw err;
    }

    return NextResponse.json({
      success: true,
      userId: sub,
      orgId,
      role: inviteRole,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
