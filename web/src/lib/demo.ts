/**
 * Local demo mode: every screen, no AWS.
 *
 * On only when BOTH `NODE_ENV !== 'production'` and `NEXT_PUBLIC_DEMO=1`, so a
 * production build can never contain a path around Cognito. The role comes from
 * a `demo_role` cookie set on /demo; API calls are answered in the browser from
 * the in-memory state below, which resets on reload.
 */
import type { Role } from './types';

export const DEMO_ENABLED =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEMO === '1';

export type DemoPersona = 'worker' | 'worker-new' | 'manager' | 'admin';

export const DEMO_PERSONAS: Record<DemoPersona, { role: Role; userId: string; label: string }> = {
  worker: { role: 'worker', userId: 'u-ravi', label: 'Worker (Ravi Kumar)' },
  'worker-new': { role: 'worker', userId: 'u-new', label: 'New worker, sees onboarding' },
  manager: { role: 'manager', userId: 'u-meera', label: 'Manager (Meera Joshi)' },
  admin: { role: 'admin', userId: 'u-admin', label: 'Admin (Plant HR)' },
};

export function demoSession(persona: string | undefined) {
  const p = DEMO_PERSONAS[(persona as DemoPersona) ?? 'worker'] ?? DEMO_PERSONAS.worker;
  return { userId: p.userId, orgId: 'demo-org', role: p.role, deptId: 'dept-maint' };
}

/* ── in-memory org ─────────────────────────────────────────────────────── */

const ORG = 'demo-org';
const now = new Date().toISOString();

type Person = {
  userId: string;
  name: string;
  role: Role;
  deptId: string | null;
  profession: string | null;
  skillLevel: string | null;
};

const departments = [
  { orgId: ORG, deptId: 'dept-maint', name: 'Maintenance', description: 'Hydraulics and electrical upkeep, Unit 2', managerIds: [] as string[], createdAt: now },
  { orgId: ORG, deptId: 'dept-ops', name: 'Machine Operations', description: 'Presses, casters and cooling beds', managerIds: [] as string[], createdAt: now },
  { orgId: ORG, deptId: 'dept-quality', name: 'Quality', description: 'Inspection and gauging', managerIds: [] as string[], createdAt: now },
];

const H = 'Hydraulics Maintenance Technician';
const E = 'Industrial Electrical Technician';
const S = 'Stationary Machinery Operator';
const people: Person[] = [
  { userId: 'u-admin', name: 'Plant HR', role: 'admin', deptId: null, profession: null, skillLevel: null },
  { userId: 'u-meera', name: 'Meera Joshi', role: 'manager', deptId: 'dept-maint', profession: null, skillLevel: null },
  { userId: 'u-arjun', name: 'Arjun Patil', role: 'manager', deptId: 'dept-ops', profession: null, skillLevel: null },
  { userId: 'u-ravi', name: 'Ravi Kumar', role: 'worker', deptId: 'dept-maint', profession: H, skillLevel: 'Level 1' },
  { userId: 'u-new', name: 'Suresh Yadav', role: 'worker', deptId: 'dept-maint', profession: null, skillLevel: null },
  { userId: 'u-3', name: 'Anil Shinde', role: 'worker', deptId: 'dept-maint', profession: H, skillLevel: 'Level 2' },
  { userId: 'u-4', name: 'Pooja Nair', role: 'worker', deptId: 'dept-maint', profession: E, skillLevel: 'Level 2' },
  { userId: 'u-5', name: 'Imran Shaikh', role: 'worker', deptId: 'dept-maint', profession: E, skillLevel: 'Level 1' },
  { userId: 'u-6', name: 'Deepak More', role: 'worker', deptId: 'dept-maint', profession: H, skillLevel: 'Level 3' },
  { userId: 'u-7', name: 'Kavita Pawar', role: 'worker', deptId: 'dept-maint', profession: null, skillLevel: null },
  { userId: 'u-8', name: 'Ramesh Gupta', role: 'worker', deptId: 'dept-ops', profession: S, skillLevel: 'Level 1' },
  { userId: 'u-9', name: 'Sunita Kale', role: 'worker', deptId: 'dept-ops', profession: S, skillLevel: 'Level 2' },
  { userId: 'u-10', name: 'Vikram Singh', role: 'worker', deptId: null, profession: null, skillLevel: null },
];

let groups = [
  { orgId: ORG, deptId: 'dept-maint', groupId: 'grp-a', name: 'Day shift', memberIds: ['u-ravi', 'u-3', 'u-4'], createdAt: now },
  { orgId: ORG, deptId: 'dept-maint', groupId: 'grp-b', name: 'Night shift', memberIds: ['u-5', 'u-6'], createdAt: now },
];

const period = now.slice(0, 7);
const [py, pm] = period.split('-').map(Number);
const prevPeriod = new Date(Date.UTC(py, pm - 2, 1)).toISOString().slice(0, 7);

const aggregates: Record<string, Record<string, object>> = {
  'dept-maint': {
    [period]: { workerCount: 14, assessmentsPassed: 31, assessmentsFailed: 9, skillGaps: { 'Relief valve diagnosis': 38, 'Pump displacement': 24, 'Lockout/tagout sequence': 17, 'Cylinder drift isolation': 12 } },
    [prevPeriod]: { workerCount: 12, assessmentsPassed: 22, assessmentsFailed: 11, skillGaps: { 'Relief valve diagnosis': 44, 'Pump displacement': 21, 'Lockout/tagout sequence': 25, 'Cylinder drift isolation': 15 } },
  },
  'dept-ops': {
    [period]: { workerCount: 9, assessmentsPassed: 18, assessmentsFailed: 8, skillGaps: { 'Emergency stop response': 41, 'Daily checklist': 19 } },
  },
};

let me = { settings: { userId: '', orgId: ORG, language: 'en', learningMode: 'speech', accessibilityMode: false } };

/* ── request handler ───────────────────────────────────────────────────── */

class DemoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function persona(): DemoPersona {
  const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )demo_role=([^;]+)/) : null;
  return ((m?.[1] as DemoPersona) in DEMO_PERSONAS ? m![1] : 'worker') as DemoPersona;
}

const entry = (p: Person) => ({ ...p });
const member = (p: Person) => ({ userId: p.userId, name: p.name, profession: p.profession, skillLevel: p.skillLevel });

function scope() {
  const s = demoSession(persona());
  if (s.role === 'admin') return departments;
  return departments.filter((d) => d.deptId === s.deptId || d.managerIds.includes(s.userId));
}

/** Answer one API call from memory, shaped exactly like the real handler. */
export async function demoRequest(path: string, init?: RequestInit): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 150));
  const url = new URL(path, 'http://demo');
  const q = url.searchParams;
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const session = demoSession(persona());
  const self = people.find((p) => p.userId === session.userId)!;

  switch (url.pathname) {
    case '/api/me':
      if (method === 'PATCH') {
        for (const k of ['name', 'profession', 'skillLevel'] as const) if (body[k] !== undefined) self[k] = body[k];
        me = { settings: { ...me.settings, ...body } };
        return { success: true };
      }
      return {
        profile: { ...self, orgId: ORG },
        settings: { ...me.settings, userId: self.userId },
      };

    case '/api/plan': {
      const titles = ['HPU overview', 'Pump and reservoir', 'Relief valve basics', 'Lockout/tagout', 'Cylinder drift', 'Pressure testing'];
      const plan = {
        userId: self.userId,
        planId: 'plan-core',
        profession: self.profession ?? H,
        skillLevel: self.skillLevel ?? 'Level 1',
        isFastTrack: true,
        modules: titles.map((title, i) => ({ seq: i + 1, lessonId: `lesson-${i + 1}`, title, completedAt: i < 3 ? now : null })),
      };
      return { plan, plans: [plan] };
    }

    case '/api/aggregates': {
      const deptId = q.get('deptId') ?? session.deptId;
      const p = q.get('period') ?? period;
      const agg = aggregates[deptId]?.[p] ?? { workerCount: 0, assessmentsPassed: 0, assessmentsFailed: 0, skillGaps: {} };
      return { aggregate: { orgId: ORG, deptId, period: p, ...agg } };
    }

    case '/api/departments':
      if (method === 'POST') {
        const d = { orgId: ORG, deptId: `dept-${Date.now()}`, name: body.name, description: body.description ?? null, managerIds: [], createdAt: new Date().toISOString() };
        departments.push(d);
        return { department: d };
      }
      if (method === 'PATCH') {
        const d = departments.find((x) => x.deptId === body.deptId);
        if (!d) throw new DemoError('Department not found', 404);
        Object.assign(d, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)));
        return { department: d };
      }
      if (method === 'DELETE') {
        const id = q.get('deptId');
        if (people.some((p) => p.deptId === id)) throw new DemoError('Move everyone out of this department before deleting it', 409);
        departments.splice(departments.findIndex((d) => d.deptId === id), 1);
        groups = groups.filter((g) => g.deptId !== id);
        return { success: true };
      }
      return { departments: [...scope()].sort((a, b) => a.name.localeCompare(b.name)) };

    case '/api/directory':
      return { people: people.map(entry).sort((a, b) => a.name.localeCompare(b.name)), truncated: false };

    case '/api/team':
      if (method === 'PATCH') {
        const p = people.find((x) => x.userId === body.userId);
        if (!p) throw new DemoError('Person not found', 404);
        groups = groups.map((g) => (g.deptId === p.deptId ? { ...g, memberIds: g.memberIds.filter((id) => id !== p.userId) } : g));
        p.deptId = body.deptId;
        return { success: true, deptId: body.deptId };
      }
      {
        const deptId = q.get('deptId') ?? session.deptId;
        return {
          deptId,
          members: people.filter((p) => p.deptId === deptId && p.role === 'worker').map(member).sort((a, b) => a.name.localeCompare(b.name)),
          truncated: false,
        };
      }

    case '/api/groups':
      if (method === 'POST') {
        const g = { orgId: ORG, deptId: body.deptId, groupId: `grp-${Date.now()}`, name: body.name, memberIds: body.memberIds ?? [], createdAt: new Date().toISOString() };
        groups.push(g);
        return { group: g };
      }
      if (method === 'PATCH') {
        const g = groups.find((x) => x.groupId === body.groupId);
        if (!g) throw new DemoError('Group not found', 404);
        if (body.name !== undefined) g.name = body.name;
        if (body.memberIds !== undefined) g.memberIds = [...new Set(body.memberIds as string[])];
        return { group: g };
      }
      if (method === 'DELETE') {
        groups = groups.filter((g) => g.groupId !== q.get('groupId'));
        return { success: true };
      }
      return { groups: groups.filter((g) => g.deptId === q.get('deptId')) };

    case '/api/invites':
      if (method === 'POST') {
        const code = Math.random().toString(16).slice(2, 18).toUpperCase().padEnd(16, '0');
        return {
          invite: { orgId: ORG, code, deptId: body.deptId ?? null, role: body.role, channel: body.channel, redeemedAt: null, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() },
        };
      }
      throw new DemoError('Not available in demo mode', 400);

    case '/api/lessons':
      return q.get('lessonId') ? Promise.reject(new DemoError('Lesson content is not in the demo', 404)) : { lessons: [] };

    case '/api/assessments':
      if (method === 'POST') return { attempt: { status: 'pending' }, queued: true };
      return q.get('assessmentId') ? Promise.reject(new DemoError('Assessment not in the demo', 404)) : { assessments: [] };

    default:
      throw new DemoError('Not available in demo mode', 404);
  }
}

export { DemoError };
