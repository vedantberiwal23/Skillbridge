/**
 * Display-only stand-ins for the parts of the worker spine that have no route.
 *
 * The handlers have landed, and the screens that had one now call it: profile
 * and settings through `/api/me`, plan and module progress through `/api/plan`,
 * lessons, assessments and the department aggregate likewise. `fixtureProfile`,
 * `fixturePlan`, `fixtureDeptAggregate` and `fixtureDeptWorkers` are no longer
 * rendered anywhere.
 *
 * What is left is what the backend genuinely does not serve yet:
 *
 *   fixtureSkillProfile  the profiler agent writes SKILLPROFILE#CURRENT and
 *                        `keys.skillProfile` builds the key, but no route reads
 *                        it back and the profiler has never been observed
 *                        running end to end.
 *   fixtureBadges        no route, no key builder. Badges are display-only for
 *                        every worker on every tier — that is the sanctioned
 *                        cut, not an oversight, and no `tier === 'paid'` gate
 *                        goes near them.
 *   fixtureOpportunities no route and no item type.
 *
 * Every shape here is still the real type from types.ts, so wiring any of them
 * later is an import swap and nothing else. Content is engineering maintenance
 * only (hydraulics/electrical/machine operation) and is authored fresh.
 */

import type {
  Assessment,
  Badge,
  DeptAggregate,
  JobOpportunity,
  Lesson,
  LearningPlan,
  SkillProfile,
  UserProfile,
  UserSettings,
} from './types';

export const ORG_ID = 'org-demo';
export const USER_ID = 'user-demo';

export const fixtureProfile: UserProfile = {
  userId: USER_ID,
  orgId: ORG_ID,
  deptId: 'dept-maintenance',
  role: 'worker',
  name: 'Ravi Kumar',
  profession: 'Hydraulics Maintenance Technician',
  skillLevel: 'Level 1',
};

export const fixtureSettings: UserSettings = {
  userId: USER_ID,
  language: 'hi',
  learningMode: 'speech',
  accessibilityMode: false,
};


export const fixtureLessons: Lesson[] = [
  {
    orgId: ORG_ID,
    lessonId: 'lesson-hpu-overview',
    title: 'How the hydraulic power unit works',
    body: 'The power unit turns motor rotation into fluid flow under pressure. Fluid is drawn from the reservoir, pushed through the system by the pump, and returns through the filter. The relief valve caps system pressure so nothing downstream sees more than it is rated for.',
    assetId: 'asset-hydraulic-power-unit',
  },
  {
    orgId: ORG_ID,
    lessonId: 'lesson-hpu-startup',
    title: 'Safe start-up procedure',
    body: 'Start-up follows the order in your plant SOP. Confirm the guard is in place, check fluid level at the sight glass, confirm the relief valve setting, then start the motor and watch the gauge settle before loading the system.',
    assetId: 'asset-hydraulic-power-unit',
  },
  {
    orgId: ORG_ID,
    lessonId: 'lesson-hpu-pressure-loss',
    title: 'Finding a pressure loss',
    body: 'Low pressure usually means fluid is going somewhere it should not, or the pump is not moving enough of it. Check the filter indicator first, then the relief valve setting, then the pump itself.',
    assetId: 'asset-hydraulic-power-unit',
  },
];

export const fixturePlan: LearningPlan = {
  userId: USER_ID,
  planId: 'plan-hyd-l1',
  profession: 'Hydraulics Maintenance Technician',
  skillLevel: 'Level 1',
  isFastTrack: true,
  modules: [
    {
      seq: 1,
      lessonId: 'lesson-hpu-overview',
      title: 'How the hydraulic power unit works',
      completedAt: '2026-09-15T09:20:00.000Z',
    },
    {
      seq: 2,
      lessonId: 'lesson-hpu-startup',
      title: 'Safe start-up procedure',
      completedAt: null,
    },
    {
      seq: 3,
      lessonId: 'lesson-hpu-pressure-loss',
      title: 'Finding a pressure loss',
      completedAt: null,
    },
  ],
};

export const fixtureAssessments: Assessment[] = [
  {
    orgId: ORG_ID,
    assessmentId: 'asmt-identify-hpu',
    kind: 'identify-part',
    title: 'Find the pressure relief valve',
    lessonId: 'lesson-hpu-overview',
  },
  {
    orgId: ORG_ID,
    assessmentId: 'asmt-sequence-startup',
    kind: 'sequence-procedure',
    title: 'Put the start-up steps in order',
    lessonId: 'lesson-hpu-startup',
  },
  {
    orgId: ORG_ID,
    assessmentId: 'asmt-diagnose-pressure',
    kind: 'diagnose-by-voice',
    title: 'The machine has lost pressure. Talk through it.',
    lessonId: 'lesson-hpu-pressure-loss',
  },
];

/** Steps for the sequence-procedure assessment, in correct order. */
export const fixtureProcedureSteps = [
  'Check the guard is in place',
  'Check fluid level at the sight glass',
  'Confirm the relief valve setting',
  'Start the motor',
  'Watch the gauge settle before loading',
];

export const fixtureSkillProfile: SkillProfile = {
  userId: USER_ID,
  updatedAt: '2026-09-17T11:00:00.000Z',
  strengths: ['Machine safety', 'Start-up procedure'],
  weaknesses: ['Fault diagnosis', 'Preventive maintenance'],
};

export const fixtureBadges: Badge[] = [
  {
    userId: USER_ID,
    badgeId: 'badge-safety',
    title: 'Machine safety',
    awardedAt: '2026-09-15T09:30:00.000Z',
  },
  {
    userId: USER_ID,
    badgeId: 'badge-hpu-basics',
    title: 'Power unit basics',
    awardedAt: '2026-09-16T14:05:00.000Z',
  },
];

/**
 * The manager dashboard reads exactly this — one materialized item, one
 * GetItem, at any workforce size (DATA-MODEL Decision 1 / access pattern M2+M3).
 * Never assembled by querying GSI1 and looping per worker: that is O(workforce)
 * per page view and degrades precisely as an org grows.
 */
export const fixtureDeptAggregate: DeptAggregate = {
  orgId: ORG_ID,
  deptId: 'dept-maintenance',
  period: '2026-09',
  workerCount: 124,
  assessmentsPassed: 318,
  assessmentsFailed: 74,
  skillGaps: {
    'Fault diagnosis': 44,
    'Preventive maintenance': 31,
    'Machine setup': 24,
    Safety: 8,
  },
};

/** Drill-down list (access pattern M1, GSI1 by department). */
export const fixtureDeptWorkers = [
  { userId: 'u-ravi', name: 'Ravi Kumar', weakest: 'Fault diagnosis', progress: 33 },
  { userId: 'u-priya', name: 'Priya Nair', weakest: null, progress: 91 },
  { userId: 'u-suresh', name: 'Suresh Rao', weakest: 'Safety', progress: 64 },
  { userId: 'u-deepa', name: 'Deepa Verma', weakest: 'Machine setup', progress: 57 },
];

/**
 * Job opportunities, matched against the worker's verified skills
 * (fixtureSkillProfile.strengths + fixtureBadges titles). Readiness is
 * computed on the client from that overlap — see (worker)/opportunities.
 */
export const fixtureOpportunities: JobOpportunity[] = [
  {
    opportunityId: 'opp-industrial-electrician',
    title: 'Industrial Electrician',
    location: 'Pune, Maharashtra',
    payRange: '₹28,000–₹38,000/month',
    requiredSkills: ['Machine safety', 'Power unit basics', 'Fault diagnosis', 'PLC basics'],
  },
  {
    opportunityId: 'opp-senior-maintenance-tech',
    title: 'Senior Maintenance Technician',
    location: 'Nashik, Maharashtra',
    payRange: '₹32,000–₹42,000/month',
    requiredSkills: ['Machine safety', 'Start-up procedure', 'Preventive maintenance'],
  },
];

export const findLesson = (lessonId: string): Lesson | undefined =>
  fixtureLessons.find((lesson) => lesson.lessonId === lessonId);

export const findAssessment = (assessmentId: string): Assessment | undefined =>
  fixtureAssessments.find((a) => a.assessmentId === assessmentId);
