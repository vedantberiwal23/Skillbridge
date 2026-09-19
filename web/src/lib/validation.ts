/**
 * Request-body validation for the `/api/*` route handlers.
 *
 * Nothing here ever validates `orgId`, `userId` or `role` out of a request —
 * those come only from verified Cognito claims via `requireSession`. What these
 * schemas guard is the rest of the payload, which is client-supplied and
 * therefore untrusted.
 */
import { z } from 'zod';
import { LOCALES } from '@/i18n/config';
import { ROLES } from './types';

/**
 * Cognito rejects a username that is not a valid email or phone, because the
 * pool is configured with `UsernameAttributes: ["email", "phone_number"]`. A
 * malformed value has to fail here rather than inside `AdminCreateUser`, since
 * by that point the invite has already been marked redeemed.
 */
export const E164 = /^\+[1-9]\d{1,14}$/;

/**
 * Mirrors the pool's password policy in `infra/lib/auth-stack.ts`: at least 8
 * characters, one lowercase letter and one digit. Uppercase and symbols are not
 * required. Kept in step with that stack by hand — if the policy changes there,
 * change it here in the same edit.
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  requireLowercase: true,
  requireDigits: true,
};

export const passwordSchema = z
  .string()
  .min(PASSWORD_POLICY.minLength, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/\d/, 'Password must contain a digit');

const phoneSchema = z.string().regex(E164, 'Phone must be in E.164 format, e.g. +919876543210');
const emailSchema = z.email('Email is not a valid address');

export const roleSchema = z.enum(ROLES);
export const localeSchema = z.enum(LOCALES);
export const learningModeSchema = z.enum(['speech', 'text']);

/** POST /api/invites — an admin issues an invite. */
export const issueInviteSchema = z
  .object({
    role: roleSchema,
    channel: z.enum(['email', 'sms']),
    deptId: z.string().min(1).nullable().optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine((v) => (v.channel === 'email' ? Boolean(v.email) : Boolean(v.phone)), {
    message: 'An email is required for the email channel, a phone for sms',
  });

/**
 * PATCH /api/invites — redemption. `role`, `orgId` and `deptId` are absent by
 * design: they are read from the stored invite, never from this body.
 */
export const redeemInviteSchema = z
  .object({
    code: z.string().trim().min(1, 'Invite code is required'),
    name: z.string().trim().min(1, 'Full name is required'),
    password: passwordSchema,
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine((v) => Boolean(v.email ?? v.phone), {
    message: 'A phone number or email is required',
  });

/** PATCH /api/me — the worker's own profile and settings. */
export const updateMeSchema = z
  .object({
    language: localeSchema.optional(),
    learningMode: learningModeSchema.optional(),
    accessibilityMode: z.boolean().optional(),
    name: z.string().trim().min(1).optional(),
    profession: z.string().trim().min(1).nullable().optional(),
    skillLevel: z.string().trim().min(1).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'No updatable fields supplied',
  });

/** PATCH /api/plan — module completion (W8 resume cursor). */
export const updatePlanSchema = z.object({
  planId: z.string().trim().min(1),
  seq: z.number().int().nonnegative(),
  completed: z.boolean(),
});

/**
 * POST /api/assessments — a submission.
 *
 * There is deliberately no `score` or `feedback` field: an attempt is scored by
 * the async scorer agent, never by the submitting client.
 */
export const submitAttemptSchema = z.object({
  assessmentId: z.string().trim().min(1),
  response: z.unknown(),
});

/* ── departments, groups and team moves (manager/admin console) ───────────── */

const idSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Not a valid id');
const nameSchema = z.string().trim().min(1, 'A name is required').max(60, 'Keep the name under 60 characters');

/** POST /api/departments — admin creates a department. The id is generated server-side. */
export const createDepartmentSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(200).nullable().optional(),
});

/** PATCH /api/departments — admin renames a department or changes who manages it. */
export const updateDepartmentSchema = z
  .object({
    deptId: idSchema,
    name: nameSchema.optional(),
    description: z.string().trim().max(200).nullable().optional(),
    managerIds: z.array(idSchema).max(20).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.managerIds !== undefined, {
    message: 'No updatable fields supplied',
  });

/** POST /api/groups */
export const createGroupSchema = z.object({
  deptId: idSchema,
  name: nameSchema,
  memberIds: z.array(idSchema).max(500).default([]),
});

/** PATCH /api/groups */
export const updateGroupSchema = z
  .object({
    deptId: idSchema,
    groupId: idSchema,
    name: nameSchema.optional(),
    memberIds: z.array(idSchema).max(500).optional(),
  })
  .refine((v) => v.name !== undefined || v.memberIds !== undefined, {
    message: 'No updatable fields supplied',
  });

/** PATCH /api/team — move a person into another department. */
export const moveMemberSchema = z.object({
  userId: idSchema,
  deptId: idSchema,
});

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly issues: { path: string; message: string }[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Parse an untrusted body, raising a `ValidationError` the route can render. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      'Request body is invalid',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
    );
  }
  return result.data;
}
