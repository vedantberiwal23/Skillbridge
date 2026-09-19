/**
 * The browser's view of the CRUD surface.
 *
 * One typed function per route handler under `web/src/app/api/`, with return
 * types that mirror what each handler actually sends — not what a screen wishes
 * it sent. Screens import from here instead of calling `fetch` inline, so a
 * change to a response shape breaks at compile time in one place rather than at
 * runtime in six.
 *
 * ## Why this is not a data-fetching library
 *
 * It deliberately has no cache, no revalidation and no store. Next's own
 * `fetch` handles that on the server, and the client screens here are simple
 * enough that a `useState` + `useEffect` pair is honest about what it does.
 *
 * ## Auth
 *
 * Nothing here sends a token. Every handler resolves the session server-side
 * from the Amplify cookie, which the browser attaches on its own for same-origin
 * requests — `credentials: 'same-origin'` is the default and is spelled out
 * below only so nobody "fixes" it later by adding an Authorization header built
 * from a client-held claim. The tenant never travels in a request.
 */
import type {
  Assessment,
  AssessmentAttempt,
  DeptAggregate,
  Invite,
  Role,
  LearningPlan,
  Lesson,
  MachineAsset,
  UserProfile,
  UserSettings,
} from './types';
import type { Locale } from '../i18n/config';

/** A handler answered, but not with success. Carries the status for the caller. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Every response goes through here.
 *
 * A handler's error body is `{ error: string }`; anything else (a proxy page, an
 * HTML error, a truncated body) must not surface as `undefined` fields on a
 * screen, so a non-JSON body becomes an ApiError carrying the status rather
 * than being parsed optimistically.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
    throw new ApiError('Malformed response from server', res.status);
  }

  if (!res.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return body as T;
}

/* ── /api/me — W1 ─────────────────────────────────────────────────────────── */

export interface MeResponse {
  profile: UserProfile | null;
  settings: UserSettings | null;
}

export const getMe = () => request<MeResponse>('/api/me');

/** The handler accepts any subset; at least one field must be present. */
export interface UpdateMeBody {
  language?: Locale;
  learningMode?: 'speech' | 'text';
  accessibilityMode?: boolean;
  name?: string;
  profession?: string | null;
  skillLevel?: string | null;
}

export const updateMe = (body: UpdateMeBody) =>
  request<{ success: true }>('/api/me', { method: 'PATCH', body: JSON.stringify(body) });

/* ── /api/plan — W2 ───────────────────────────────────────────────────────── */

/** `plan` is the most recent; `plans` is every plan, newest first. */
export interface PlanResponse {
  plan: LearningPlan | null;
  plans: LearningPlan[];
}

export const getPlan = (planId?: string) =>
  request<PlanResponse>(`/api/plan${planId ? `?planId=${encodeURIComponent(planId)}` : ''}`);

/** `seq` is the module's sequence number, not its index in a rendered list. */
export const setModuleCompleted = (planId: string, seq: number, completed: boolean) =>
  request<{ success: true; completedAt: string | null }>('/api/plan', {
    method: 'PATCH',
    body: JSON.stringify({ planId, seq, completed }),
  });

/* ── /api/lessons — W3 ────────────────────────────────────────────────────── */

export const getLessons = () => request<{ lessons: Lesson[] }>('/api/lessons');

/** `asset` is null when the lesson carries no `assetId`, or the item is missing. */
export const getLesson = (lessonId: string) =>
  request<{ lesson: Lesson; asset: MachineAsset | null }>(
    `/api/lessons?lessonId=${encodeURIComponent(lessonId)}`
  );

/* ── /api/assessments — W4 ────────────────────────────────────────────────── */

export const getAssessments = () => request<{ assessments: Assessment[] }>('/api/assessments');

export const getAssessment = (assessmentId: string) =>
  request<{ assessment: Assessment; attempts: AssessmentAttempt[] }>(
    `/api/assessments?assessmentId=${encodeURIComponent(assessmentId)}`
  );

/**
 * Submit an attempt.
 *
 * There is deliberately no `score` argument. The attempt comes back `pending`
 * and is scored by the async scorer agent; a client that could send a score
 * could send a perfect one. Re-fetch with `getAssessment` to see the result.
 */
export const submitAttempt = (assessmentId: string, response: unknown) =>
  request<{ attempt: AssessmentAttempt; queued: boolean }>('/api/assessments', {
    method: 'POST',
    body: JSON.stringify({ assessmentId, response }),
  });

/* ── /api/aggregates — M2/M3 ──────────────────────────────────────────────── */

/**
 * One GetItem on the materialized `AGG#DEPT#<deptId>#<period>` item.
 *
 * `deptId` is optional because the handler falls back to the caller's own
 * department from the verified session. Passing another department's id is
 * allowed only for an admin, and the handler — not this function — decides that.
 * Never build this number by listing workers and summing: that is O(workforce)
 * per page view and the aggregate exists precisely to avoid it.
 */
export const getDeptAggregate = (deptId?: string, period?: string) => {
  const qs = new URLSearchParams();
  if (deptId) qs.set('deptId', deptId);
  if (period) qs.set('period', period);
  const suffix = qs.toString();
  return request<{ aggregate: DeptAggregate }>(`/api/aggregates${suffix ? `?${suffix}` : ''}`);
};

/* ── /api/invites — A3/A4 ─────────────────────────────────────────────────── */

export interface IssueInviteBody {
  role: Role;
  channel: 'email' | 'sms';
  /** Null places the worker in no department; the key builder maps that to NONE. */
  deptId?: string | null;
  email?: string;
  phone?: string;
}

/**
 * Issue an invite. Admin only, enforced by the handler.
 *
 * The org is never sent: the handler takes it from the verified session and
 * stamps it on the stored invite, which is also where redemption later reads
 * `role`, `orgId` and `deptId` from — never from the redeeming request. The
 * code itself is generated server-side with crypto.randomBytes.
 */
export const issueInvite = (body: IssueInviteBody) =>
  request<{ invite: Invite }>('/api/invites', {
    method: 'POST',
    body: JSON.stringify(body),
  });
