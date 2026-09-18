/** Domain types. Key scheme and access patterns: DATA-MODEL.md */

export type Role = 'worker' | 'manager' | 'admin';

export type LearningMode = 'speech' | 'text';

/** Org tier. Both tiers are org-level — there is no individual account. */
export type Tier = 'free' | 'paid';

export interface Org {
  orgId: string;
  name: string;
  tier: Tier;
  /** Feature entitlements live on the org, not in the data model's shape. */
  entitlements: { certificates: boolean; seats: number };
}

export interface Department {
  orgId: string;
  deptId: string;
  name: string;
}

export interface UserProfile {
  userId: string;
  orgId: string;
  deptId: string | null;
  role: Role;
  name: string;
  profession: string | null;
  skillLevel: string | null;
}

export interface UserSettings {
  userId: string;
  language: string;
  learningMode: LearningMode;
  accessibilityMode: boolean;
}

export interface Invite {
  orgId: string;
  code: string;
  deptId: string | null;
  role: Role;
  /** Most of this workforce has no domain email, so SMS is a first-class path. */
  channel: 'email' | 'sms';
  redeemedAt: string | null;
  expiresAt: string;
}

export interface LearningPlan {
  userId: string;
  planId: string;
  profession: string;
  skillLevel: string;
  modules: PlanModule[];
  /** Front-loaded onboarding path; early tenure is where attrition concentrates. */
  isFastTrack: boolean;
}

export interface PlanModule {
  seq: number;
  lessonId: string;
  title: string;
  completedAt: string | null;
}

export interface Lesson {
  orgId: string;
  lessonId: string;
  title: string;
  body: string;
  /** 3D model shown with this lesson, if any. */
  assetId: string | null;
}

export interface MachineAsset {
  orgId: string;
  assetId: string;
  name: string;
  glbUrl: string;
  /** Pre-rendered still used when the device or network cannot carry live 3D. */
  posterUrl: string;
  hotspots: AssetHotspot[];
}

/** A tappable component on the model — the anchor for "tap a part, ask about it". */
export interface AssetHotspot {
  id: string;
  label: string;
  position: string;
  normal: string;
}

export type AssessmentKind =
  | 'identify-part'
  | 'sequence-procedure'
  | 'diagnose-by-voice';

export interface Assessment {
  orgId: string;
  assessmentId: string;
  kind: AssessmentKind;
  title: string;
  lessonId: string | null;
}

export interface AssessmentAttempt {
  userId: string;
  assessmentId: string;
  submittedAt: string;
  score: number;
  /** Scored on the reasoning path, not only the final answer. */
  feedback: string;
}

/** Derived by the async profiler — never computed on read. */
export interface SkillProfile {
  userId: string;
  updatedAt: string;
  strengths: string[];
  weaknesses: string[];
}

/** Materialized on write. A manager dashboard is one GetItem at any size. */
export interface DeptAggregate {
  orgId: string;
  deptId: string;
  period: string;
  workerCount: number;
  assessmentsPassed: number;
  assessmentsFailed: number;
  skillGaps: Record<string, number>;
}

export interface Badge {
  userId: string;
  badgeId: string;
  title: string;
  awardedAt: string;
}

/**
 * A role a worker's verified skills can qualify them for. Skill names here
 * are matched against SkillProfile.strengths / fixtureBadges by exact string —
 * fine for the fixture stage, but the real version needs a stable skill id,
 * not a title, once this reads from the database.
 */
export interface JobOpportunity {
  opportunityId: string;
  title: string;
  location: string;
  payRange: string;
  requiredSkills: string[];
}
