import { NextRequest, NextResponse } from 'next/server';
import { BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_NAME } from '@/lib/ddb';
import { keys } from '@/lib/keys';
import { requireSession, handleApiError, AuthError } from '@/lib/auth';
import { UserProfile, UserSettings } from '@/lib/types';

/**
 * GET /api/me — Profile + settings for the signed-in worker (Pattern W1).
 *
 * Single batch fetch on USER#<userId> with SK in (PROFILE, SETTINGS).
 * Verifies tenant boundary against verified session claim.
 */
export async function GET(req?: NextRequest) {
  try {
    const session = await requireSession(undefined, req);

    const res = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: [
              keys.profile(session.userId),
              keys.settings(session.userId),
            ],
          },
        },
      })
    );

    const items = res.Responses?.[TABLE_NAME] ?? [];
    const profile = items.find((i) => i.SK === 'PROFILE') as UserProfile | undefined;
    const settings = items.find((i) => i.SK === 'SETTINGS') as UserSettings | undefined;

    if (profile && profile.orgId !== session.orgId) {
      throw new AuthError('Tenant isolation violation', 403);
    }

    return NextResponse.json({
      profile: profile ?? null,
      settings: settings ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/me — Update profile and/or settings for the signed-in worker.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    const updates: Promise<unknown>[] = [];

    // Settings update: language, learningMode, accessibilityMode
    if (
      body.language !== undefined ||
      body.learningMode !== undefined ||
      body.accessibilityMode !== undefined
    ) {
      const exprParts: string[] = [];
      const exprValues: Record<string, unknown> = {};
      const exprNames: Record<string, string> = {};

      if (body.language !== undefined) {
        exprParts.push('#lang = :lang');
        exprNames['#lang'] = 'language';
        exprValues[':lang'] = body.language;
      }
      if (body.learningMode !== undefined) {
        exprParts.push('#mode = :mode');
        exprNames['#mode'] = 'learningMode';
        exprValues[':mode'] = body.learningMode;
      }
      if (body.accessibilityMode !== undefined) {
        exprParts.push('#a11y = :a11y');
        exprNames['#a11y'] = 'accessibilityMode';
        exprValues[':a11y'] = Boolean(body.accessibilityMode);
      }

      if (exprParts.length > 0) {
        updates.push(
          ddb.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: keys.settings(session.userId),
              UpdateExpression: `SET ${exprParts.join(', ')}`,
              ExpressionAttributeNames: exprNames,
              ExpressionAttributeValues: exprValues,
            })
          )
        );
      }
    }

    // Profile update: name, profession, skillLevel
    if (
      body.name !== undefined ||
      body.profession !== undefined ||
      body.skillLevel !== undefined
    ) {
      const exprParts: string[] = [];
      const exprValues: Record<string, unknown> = {};
      const exprNames: Record<string, string> = {};

      if (body.name !== undefined) {
        exprParts.push('#name = :name');
        exprNames['#name'] = 'name';
        exprValues[':name'] = body.name;
      }
      if (body.profession !== undefined) {
        exprParts.push('#prof = :prof');
        exprNames['#prof'] = 'profession';
        exprValues[':prof'] = body.profession;
      }
      if (body.skillLevel !== undefined) {
        exprParts.push('#lvl = :lvl');
        exprNames['#lvl'] = 'skillLevel';
        exprValues[':lvl'] = body.skillLevel;
      }

      if (exprParts.length > 0) {
        updates.push(
          ddb.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: keys.profile(session.userId),
              UpdateExpression: `SET ${exprParts.join(', ')}`,
              ExpressionAttributeNames: exprNames,
              ExpressionAttributeValues: exprValues,
            })
          )
        );
      }
    }

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
