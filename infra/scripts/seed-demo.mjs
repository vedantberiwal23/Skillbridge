#!/usr/bin/env node
/**
 * Make a provisioned org demo-ready: departments, a lesson catalogue,
 * assessments, a department aggregate, and — for one worker — the profile,
 * settings and learning plan the worker screens read.
 *
 *   node infra/scripts/seed-demo.mjs                        # org content only
 *   node infra/scripts/seed-demo.mjs --email demo-worker@skillbridge.test
 *   node infra/scripts/seed-demo.mjs --user-id <cognito-sub> --name "Ravi Kumar"
 *
 * Idempotent: every write is a PutItem, so running it twice leaves the same
 * table. Safe to run before or after `provision-org.mjs` and `seed-content.mjs`,
 * neither of which it duplicates — those handle ORG#META/SUB and the Knowledge
 * Base documents respectively.
 *
 * ## Why this exists
 *
 * A Cognito user is not a SkillBridge worker. Accounts created outside invite
 * redemption — by `web/scripts/dev-token.mjs`, or by hand in the console — have
 * no `USER#<sub>` / `PROFILE` item, so `/api/me` answers `{profile: null}` and
 * every screen that greets the worker by name renders blank. Likewise a worker
 * with no `PLAN#` sees an empty plan, and a manager whose department has no
 * `AGG#DEPT#` item sees a dashboard of zeroes. None of that is a bug in the
 * handlers; it is missing data, and this script is where it comes from.
 *
 * ## Rules this script is bound by
 *
 * - Keys mirror `web/src/lib/keys.ts` exactly. They are written out here because
 *   a .mjs script cannot import the TypeScript module, NOT because inline keys
 *   are acceptable in application code — they are not. If keys.ts changes, this
 *   changes with it.
 * - `orgId` is set explicitly on every item. The DocumentClient strips
 *   undefined, and an item without it fails every isolation check downstream.
 * - GSI1 keys go on the `PROFILE` item and nowhere else. GSI1 is sparse by
 *   design; projecting every item would clone the table into one per-org index
 *   partition.
 * - Module `seq` is zero-padded to three digits, because sort keys compare
 *   lexicographically and an unpadded `MOD#10` sorts before `MOD#2`.
 * - No `ttl` attribute on anything here. That belongs to `EVT#` and `CACHE#`
 *   items only.
 * - Assessment `kind` is one of exactly three: identify-part,
 *   sequence-procedure, diagnose-by-voice. There is no fourth and no fallback
 *   to generic multiple choice.
 * - Content stays inside engineering maintenance — hydraulics, electrical,
 *   machine operation.
 */
import { execFileSync } from 'node:child_process';

const AWS =
  process.env.AWS_CLI ??
  'C:/Users/nagwa/AppData/Local/Programs/Amazon/AWSCLIV2/aws.exe';
const PROFILE = process.env.AWS_PROFILE ?? 'skillbridge';
const REGION = 'ap-northeast-1';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const ORG_ID = arg('org-id', 'demo-industrial');
const DEPT_ID = arg('dept-id', 'dept-maint');
const TABLE = arg(
  'table',
  process.env.APP_TABLE_NAME ?? 'skillbridge-data-AppTable815C50BC-1DQOV4FJ7QUT6'
);
const POOL = arg('user-pool-id', process.env.COGNITO_USER_POOL_ID ?? 'ap-northeast-1_mVCiV8Voi');

const aws = (args, { quiet = false } = {}) => {
  try {
    return execFileSync(AWS, [...args, '--profile', PROFILE, '--region', REGION], {
      encoding: 'utf8',
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'inherit'],
    });
  } catch (err) {
    if (quiet) return null;
    throw err;
  }
};

/** Minimal DynamoDB AttributeValue marshaller — enough for the shapes below. */
const av = (v) => {
  if (v === null) return { NULL: true };
  if (typeof v === 'string') return { S: v };
  if (typeof v === 'number') return { N: String(v) };
  if (typeof v === 'boolean') return { BOOL: v };
  if (Array.isArray(v)) return { L: v.map(av) };
  if (typeof v === 'object') {
    return { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, av(x)])) };
  }
  throw new Error(`unmarshallable: ${typeof v}`);
};

const put = (item, label) => {
  aws(['dynamodb', 'put-item', '--table-name', TABLE, '--item', JSON.stringify(av(item).M)]);
  console.log(`  + ${label}`);
};

const orgPk = `ORG#${ORG_ID}`;
const userPk = (userId) => `USER#${userId}`;
/** Mirrors gsi1.sk(): DEPT#<deptId|NONE>#ROLE#<role>#USER#<userId>. */
const gsi1Sk = (deptId, role, userId) => `DEPT#${deptId ?? 'NONE'}#ROLE#${role}#USER#${userId}`;

/* ── departments ──────────────────────────────────────────────────────────── */

const DEPARTMENTS = [
  { deptId: DEPT_ID, name: 'Maintenance' },
  { deptId: 'dept-ops', name: 'Machine Operations' },
];

/* ── lesson catalogue ─────────────────────────────────────────────────────── */

const LESSONS = [
  {
    lessonId: 'dcv-intro',
    title: 'Intro to Directional Control Valves',
    body: 'A directional control valve routes fluid to actuators and sets the direction of travel. Spool position determines which ports are connected; centre condition determines what happens when the valve is at rest.',
  },
  {
    lessonId: 'hydraulic-basics',
    title: 'Hydraulic Basics: Pressure and Flow',
    body: 'Pressure is resistance to flow, not a cause of it. Flow determines actuator speed; pressure rises only to the level the load demands, up to the relief setting.',
  },
  {
    lessonId: 'pump-types',
    title: 'Gear, Vane and Piston Pumps',
    body: 'Fixed displacement pumps move the same volume per revolution regardless of load. Variable displacement pumps change swashplate angle to match demand, which matters for heat and efficiency.',
  },
  {
    lessonId: 'relief-valves',
    title: 'Relief Valves and Circuit Protection',
    body: 'A relief valve caps system pressure by diverting flow to tank above its setting. A relief that chatters or runs hot is doing work it was not sized for, and is usually a symptom rather than the fault.',
  },
  {
    lessonId: 'cylinder-drift',
    title: 'Diagnosing Cylinder Drift',
    body: 'A cylinder that creeps under a held load is losing fluid past a seal, a valve spool, or a load-holding valve. Isolating which one means testing in order, not guessing.',
  },
  {
    lessonId: 'electrical-loto',
    title: 'Lockout/Tagout Before Electrical Work',
    body: 'Isolate, lock, tag, then test the circuit dead with a meter you have proven on a known live source. Stored energy in capacitors and accumulators does not disappear when the disconnect opens.',
  },
];

/* ── assessments ──────────────────────────────────────────────────────────── */

/**
 * Questions live on the `ASMT#` item, not in the web bundle.
 *
 * They used to be a hardcoded array in `web/src/data/questions.ts`, filtered by
 * a trade id read from localStorage, so every org saw the same fourteen
 * questions regardless of its own course material and the answer key shipped to
 * the browser inside the source. Seeding them here means an org's assessments
 * follow its own lessons, and `GET /api/assessments` is the only way to get
 * them. Each set is written against the lesson its assessment points at.
 */
const ASSESSMENT_QUESTIONS = {
  "diag-cylinder-drift": [
    {
      "id": "drift-q1",
      "topic": "Cylinder drift",
      "prompt": "A loaded cylinder creeps down slowly with the directional valve centred. What is the most likely cause?",
      "options": [
        "Fluid bypassing the piston seal inside the cylinder.",
        "The pump is worn and cannot build pressure.",
        "The reservoir breather is blocked.",
        "The electric motor is running in reverse."
      ],
      "correctIndex": 0,
      "explanation": "With the valve centred the cylinder is hydraulically locked, so movement means fluid is crossing the piston past a worn seal. A worn pump would fail to lift the load at all rather than let it creep.",
      "safetyRef": "Support or lower the load before working on a drifting cylinder."
    },
    {
      "id": "drift-q2",
      "topic": "Cylinder drift",
      "prompt": "The cylinder holds when the valve is centred but drifts when the valve is shifted and held. What does that point to?",
      "options": [
        "The directional valve spool is leaking across its lands.",
        "The piston seal has failed.",
        "The rod seal is leaking externally.",
        "The relief valve is set too high."
      ],
      "correctIndex": 0,
      "explanation": "Holding when centred clears the piston seal: the leak path only opens when the spool is shifted, which places it in the valve rather than the cylinder.",
      "safetyRef": "Isolate and relieve pressure before removing a valve."
    },
    {
      "id": "drift-q3",
      "topic": "Load holding",
      "prompt": "What is the purpose of a pilot-operated check valve on a cylinder that holds a load?",
      "options": [
        "To block return flow until pilot pressure deliberately opens it.",
        "To limit the maximum pressure in the circuit.",
        "To filter particles out of the return line.",
        "To keep the fluid at a constant temperature."
      ],
      "correctIndex": 0,
      "explanation": "It locks the load hydraulically and only releases when pilot pressure is applied, so a hose failure downstream cannot drop the load.",
      "safetyRef": "Never rely on a load-holding valve as the only support when working underneath."
    }
  ],
  "identify-dcv-ports": [
    {
      "id": "dcv-q1",
      "topic": "Valve ports",
      "prompt": "On a 4/3 directional control valve, which port is fed from the pump?",
      "options": [
        "P",
        "T",
        "A",
        "B"
      ],
      "correctIndex": 0,
      "explanation": "P is the pressure port and takes pump flow. T returns to tank; A and B go to the two sides of the actuator.",
      "safetyRef": "Confirm the pump is stopped and pressure relieved before cracking any port."
    },
    {
      "id": "dcv-q2",
      "topic": "Valve ports",
      "prompt": "Which port carries fluid back to the reservoir?",
      "options": [
        "T",
        "P",
        "A",
        "B"
      ],
      "correctIndex": 0,
      "explanation": "T is the tank port. Restricting it raises back pressure and can damage seals.",
      "safetyRef": "A blocked tank line can burst a return hose. Never plug T to test a circuit."
    },
    {
      "id": "dcv-q3",
      "topic": "Centre condition",
      "prompt": "What does a closed-centre spool do when the valve is in its neutral position?",
      "options": [
        "Blocks all four ports, holding the actuator in place.",
        "Connects P to T so the pump unloads to tank.",
        "Connects A and B together and blocks P.",
        "Opens every port to tank."
      ],
      "correctIndex": 0,
      "explanation": "A closed centre blocks P, T, A and B, which holds the actuator but leaves the pump deadheaded unless the system compensates.",
      "safetyRef": "A deadheaded fixed-displacement pump relies on the relief valve; check its setting."
    }
  ],
  "sequence-loto": [
    {
      "id": "loto-q1",
      "topic": "Lockout/tagout",
      "prompt": "What is the FIRST step of a lockout/tagout procedure?",
      "options": [
        "Notify everyone affected that the equipment is being shut down.",
        "Apply your personal lock to the isolating device.",
        "Test that the machine will not start.",
        "Release stored energy."
      ],
      "correctIndex": 0,
      "explanation": "Notification comes first so nobody is caught out by the shutdown or tries to restart the machine mid-procedure.",
      "safetyRef": "Lockout/tagout is a life-critical procedure. Follow your site permit exactly."
    },
    {
      "id": "loto-q2",
      "topic": "Lockout/tagout",
      "prompt": "After isolating the energy source and applying locks, what must be done before work begins?",
      "options": [
        "Verify isolation by attempting a normal start, then returning controls to off.",
        "Remove the tag so it is not damaged during the work.",
        "Restore power briefly to confirm the lock holds.",
        "Sign the permit and begin immediately."
      ],
      "correctIndex": 0,
      "explanation": "Verification is the step that proves the isolation is real. Skipping it is how people are injured by circuits they believed were dead.",
      "safetyRef": "Try-out is mandatory. An untested isolation is not an isolation."
    },
    {
      "id": "loto-q3",
      "topic": "Stored energy",
      "prompt": "Which of these still holds energy after electrical isolation?",
      "options": [
        "A raised hydraulic accumulator or a suspended load.",
        "An open circuit breaker.",
        "A de-energised contactor coil.",
        "An isolated control transformer."
      ],
      "correctIndex": 0,
      "explanation": "Accumulators, springs, raised loads and capacitors hold energy after the supply is cut, and each must be discharged or blocked separately.",
      "safetyRef": "Bleed accumulators and block suspended loads before any work."
    }
  ]
};

const ASSESSMENTS = [
  {
    assessmentId: 'diag-cylinder-drift',
    lessonId: 'cylinder-drift',
    kind: 'diagnose-by-voice',
    title: 'Diagnose: cylinder drifts under load',
  },
  {
    assessmentId: 'identify-dcv-ports',
    lessonId: 'dcv-intro',
    kind: 'identify-part',
    title: 'Identify the ports on a directional control valve',
  },
  {
    assessmentId: 'sequence-loto',
    lessonId: 'electrical-loto',
    kind: 'sequence-procedure',
    title: 'Put the lockout/tagout steps in order',
  },
];

/* ── the worker's plan ────────────────────────────────────────────────────── */

const PLAN_ID = 'plan-maint-l1';
const PLAN_MODULES = [
  { seq: 1, lessonId: 'hydraulic-basics', title: 'Hydraulic Basics: Pressure and Flow', done: true },
  { seq: 2, lessonId: 'pump-types', title: 'Gear, Vane and Piston Pumps', done: true },
  { seq: 3, lessonId: 'dcv-intro', title: 'Intro to Directional Control Valves', done: true },
  { seq: 4, lessonId: 'relief-valves', title: 'Relief Valves and Circuit Protection', done: false },
  { seq: 5, lessonId: 'cylinder-drift', title: 'Diagnosing Cylinder Drift', done: false },
  { seq: 6, lessonId: 'electrical-loto', title: 'Lockout/Tagout Before Electrical Work', done: false },
];

/* ── resolve the worker ───────────────────────────────────────────────────── */

let userId = arg('user-id', null);
const email = arg('email', null);
const workerName = arg('name', 'Ravi Kumar');

if (!userId && email) {
  const out = aws(
    [
      'cognito-idp',
      'list-users',
      '--user-pool-id',
      POOL,
      '--filter',
      `email = "${email}"`,
      '--output',
      'json',
    ],
    { quiet: true }
  );
  const found = out && JSON.parse(out).Users?.[0];
  // The Cognito sub is the userId verbatim, everywhere. Never mint an
  // application-side user id.
  userId = found?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? null;
  if (!userId) console.warn(`! no Cognito user matched ${email}; skipping per-user seed`);
}

/* ── write ────────────────────────────────────────────────────────────────── */

console.log(`seeding demo content for ORG#${ORG_ID} into ${TABLE}\n`);

console.log('departments');
for (const d of DEPARTMENTS) {
  put(
    { PK: orgPk, SK: `DEPT#${d.deptId}`, orgId: ORG_ID, deptId: d.deptId, name: d.name },
    `DEPT#${d.deptId}`
  );
}

console.log('lessons');
for (const l of LESSONS) {
  // assetId stays null until a GLB exists in the assets bucket and an ASSET#
  // item points at it. The viewer's 2D path renders regardless.
  put(
    {
      PK: orgPk,
      SK: `LESSON#${l.lessonId}`,
      orgId: ORG_ID,
      lessonId: l.lessonId,
      title: l.title,
      body: l.body,
      assetId: null,
    },
    `LESSON#${l.lessonId}`
  );
}

console.log('assessments');
for (const a of ASSESSMENTS) {
  put(
    {
      PK: orgPk,
      SK: `ASMT#${a.assessmentId}`,
      orgId: ORG_ID,
      assessmentId: a.assessmentId,
      lessonId: a.lessonId,
      kind: a.kind,
      title: a.title,
      questions: ASSESSMENT_QUESTIONS[a.assessmentId] ?? [],
    },
    `ASMT#${a.assessmentId} (${a.kind}, ${(ASSESSMENT_QUESTIONS[a.assessmentId] ?? []).length} questions)`
  );
}

console.log('department aggregate');
{
  // Normally written by the profiler with UpdateItem + ADD, never
  // read-modify-write. Seeded directly here only because the profiler needs
  // live worker traffic before it produces anything, and the dashboard should
  // not demo as a grid of zeroes.
  const period = new Date().toISOString().slice(0, 7);
  put(
    {
      PK: orgPk,
      SK: `AGG#DEPT#${DEPT_ID}#${period}`,
      orgId: ORG_ID,
      deptId: DEPT_ID,
      period,
      workerCount: 14,
      assessmentsPassed: 31,
      assessmentsFailed: 9,
      skillGaps: {
        'Relief valve diagnosis': 38,
        'Pump displacement': 24,
        'Lockout/tagout sequence': 17,
        'Cylinder drift isolation': 12,
      },
    },
    `AGG#DEPT#${DEPT_ID}#${period}`
  );
}

if (userId) {
  console.log(`worker ${userId}`);
  put(
    {
      PK: userPk(userId),
      SK: 'PROFILE',
      // GSI1 is written here and on no other item type.
      GSI1PK: orgPk,
      GSI1SK: gsi1Sk(DEPT_ID, 'worker', userId),
      userId,
      orgId: ORG_ID,
      deptId: DEPT_ID,
      role: 'worker',
      name: workerName,
      profession: 'Hydraulics Technician',
      skillLevel: 'Level 1',
    },
    'PROFILE'
  );
  put(
    {
      PK: userPk(userId),
      SK: 'SETTINGS',
      userId,
      orgId: ORG_ID,
      language: 'hi',
      learningMode: 'speech',
      accessibilityMode: false,
    },
    'SETTINGS'
  );
  put(
    {
      PK: userPk(userId),
      SK: `PLAN#${PLAN_ID}`,
      userId,
      orgId: ORG_ID,
      planId: PLAN_ID,
      profession: 'Hydraulics Technician',
      skillLevel: 'Level 1',
      isFastTrack: false,
    },
    `PLAN#${PLAN_ID}`
  );
  const completedAt = new Date(Date.now() - 86_400_000).toISOString();
  for (const m of PLAN_MODULES) {
    const seq = String(m.seq).padStart(3, '0');
    put(
      {
        PK: userPk(userId),
        SK: `PLAN#${PLAN_ID}#MOD#${seq}`,
        userId,
        orgId: ORG_ID,
        planId: PLAN_ID,
        seq: m.seq,
        lessonId: m.lessonId,
        title: m.title,
        completedAt: m.done ? completedAt : null,
      },
      `PLAN#${PLAN_ID}#MOD#${seq}${m.done ? ' (done)' : ''}`
    );
  }
} else {
  console.log('\n! no worker seeded — pass --email or --user-id to seed a profile and plan');
}

console.log('\ndone.');
