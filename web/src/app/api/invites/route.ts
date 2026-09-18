import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { keys, gsi1, gsi2, userPk } from '@/lib/keys';
import { requireSession, handleApiError } from '@/lib/auth';
import { provisionCognitoUser } from '@/lib/cognito';
import { Role } from '@/lib/types';

/**
 * POST /api/invites — Admin issues an invite (Pattern A3).
 *
 * Scoped to admin only. Generates a secure code, sets expiry, and records
 * the invite under the tenant's ORG# partition and GSI2 for redemption lookup.
 *
 * CRITICAL (CLAUDE.md):
 * Do NOT set redeemedAt: null. Omit the attribute completely at issue time
 * so conditional checks on attribute_not_exists(redeemedAt) function properly.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession('admin', req);
    const body = await req.json();

    const { deptId, role, channel, phone, email } = body;

    if (!role || !['worker', 'manager', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Valid role is required (worker, manager, admin)' },
        { status: 400 }
      );
    }

    if (!channel || !['email', 'sms'].includes(channel)) {
      return NextResponse.json(
        { error: 'Valid channel is required (email or sms)' },
        { status: 400 }
      );
    }

    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    // Default expiry: 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const inviteKey = keys.invite(session.orgId, code);
    const item = {
      PK: inviteKey.PK,
      SK: inviteKey.SK,
      GSI2PK: gsi2.invitePk(code),
      GSI2SK: gsi2.sk(session.orgId),
      orgId: session.orgId,
      code,
      deptId: deptId ?? null,
      role: role as Role,
      channel,
      phone: phone ?? null,
      email: email ?? null,
      expiresAt,
      // Notice: redeemedAt is omitted entirely here
    };

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    return NextResponse.json({ invite: item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/invites — Redeem an invite by code (Pattern A4).
 *
 * Public endpoint (no session required since worker does not have an account yet).
 *
 * Strictly follows the redemption sequence from CLAUDE.md:
 * 1. GSI2 lookup on INVITE#<code> to find the invite and orgId.
 * 2. Conditional UpdateItem on ORG#<orgId> / INVITE#<code> marking redeemedAt,
 *    guarded on not-already-redeemed AND expiresAt > now.
 * 3. Only then create the Cognito user (AdminCreateUser with SUPPRESS, AdminAddUserToGroup,
 *    AdminSetUserPassword with Permanent: true). Copy orgId/deptId/role strictly from the
 *    invite item — never from the request.
 * 4. Write initial USER#<sub>/PROFILE with GSI1 and USER#<sub>/SETTINGS in DynamoDB.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, name, password, phone, email } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Invite code is required' }, { status: 400 });
    }
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const username = phone || email;
    if (!username) {
      return NextResponse.json(
        { error: 'Phone number or email is required for registration' },
        { status: 400 }
      );
    }

    // 1. GSI2 lookup on INVITE#<code>
    const gsi2Res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': gsi2.invitePk(code.trim().toUpperCase()),
        },
      })
    );

    const invite = gsi2Res.Items?.[0];
    if (!invite) {
      return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Invite code has expired' }, { status: 400 });
    }

    // 2. Conditional UpdateItem on ORG#<orgId> / INVITE#<code>
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: keys.invite(invite.orgId, invite.code),
          ConditionExpression:
            'attribute_not_exists(redeemedAt) AND expiresAt > :now',
          UpdateExpression: 'SET redeemedAt = :now',
          ExpressionAttributeValues: {
            ':now': now,
          },
        })
      );
    } catch (err: unknown) {
      const isConditionalCheckFailed =
        err instanceof Error &&
        (err.name === 'ConditionalCheckFailedException' ||
          err.message.includes('ConditionalCheckFailedException'));

      if (isConditionalCheckFailed) {
        return NextResponse.json(
          { error: 'Invite code is invalid, already redeemed, or expired' },
          { status: 400 }
        );
      }
      throw err;
    }

    // 3. Create Cognito user server-side with verified tenant attributes
    const { sub } = await provisionCognitoUser({
      username,
      password,
      name,
      orgId: invite.orgId, // from verified invite, NEVER from request
      deptId: invite.deptId ?? null,
      role: invite.role as Role,
      email,
      phone,
    });

    // 4. Create USER#<sub> / PROFILE (with GSI1) and USER#<sub> / SETTINGS
    const profileItem = {
      PK: userPk(sub),
      SK: 'PROFILE',
      userId: sub,
      orgId: invite.orgId,
      deptId: invite.deptId ?? null,
      role: invite.role,
      name,
      profession: null,
      skillLevel: null,
      GSI1PK: gsi1.pk(invite.orgId),
      GSI1SK: gsi1.sk(invite.deptId ?? null, invite.role, sub),
    };

    const settingsItem = {
      PK: userPk(sub),
      SK: 'SETTINGS',
      userId: sub,
      orgId: invite.orgId,
      language: 'hi',
      learningMode: 'speech',
      accessibilityMode: false,
    };

    await Promise.all([
      ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: profileItem,
        })
      ),
      ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: settingsItem,
        })
      ),
    ]);

    return NextResponse.json({
      success: true,
      userId: sub,
      orgId: invite.orgId,
      role: invite.role,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
