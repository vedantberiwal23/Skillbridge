'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';

interface WorkerRecord {
  userId: string;
  name: string;
  employeeId: string;
  profession: string;
  skillLevel: string;
  deptName: string;
  learningMode: 'speech' | 'text';
  language: string;
  isFastTrack: boolean;
  progress: number;
  weakest: string | null;
  planTitle: string;
  planId: string;
  modules: {
    seq: number;
    title: string;
    completedAt: string | null;
  }[];
  skillProfile: {
    updatedAt: string;
    strengths: string[];
    weaknesses: string[];
  };
  assessments: {
    id: string;
    title: string;
    kind: 'identify-part' | 'sequence-procedure' | 'diagnose-by-voice';
    score: number | null;
    status: 'passed' | 'pending' | 'scheduled';
    submittedAt: string | null;
  }[];
  badges: {
    id: string;
    title: string;
    awardedAt: string;
  }[];
}

const WORKERS_DATA: WorkerRecord[] = [
  {
    userId: 'u-ravi',
    name: 'Ravi Kumar',
    employeeId: 'EMP-74892',
    profession: 'Hydraulics Maintenance Technician',
    skillLevel: 'Level 1 (Foundation)',
    deptName: 'Mechanical Maintenance',
    learningMode: 'speech',
    language: 'Hindi (हिन्दी)',
    isFastTrack: true,
    progress: 33,
    weakest: 'Fault diagnosis',
    planTitle: 'Hydraulic Power Unit & Circuit Maintenance',
    planId: 'plan-hyd-l1',
    modules: [
      {
        seq: 1,
        title: 'How the hydraulic power unit works',
        completedAt: '15 Sep 2026',
      },
      {
        seq: 2,
        title: 'Safe start-up procedure',
        completedAt: null,
      },
      {
        seq: 3,
        title: 'Finding a pressure loss',
        completedAt: null,
      },
    ],
    skillProfile: {
      updatedAt: '17 Sep 2026',
      strengths: ['Machine safety', 'Start-up procedure'],
      weaknesses: ['Fault diagnosis', 'Preventive maintenance'],
    },
    assessments: [
      {
        id: 'asmt-identify-hpu',
        title: 'Find the pressure relief valve',
        kind: 'identify-part',
        score: 90,
        status: 'passed',
        submittedAt: '15 Sep 2026',
      },
      {
        id: 'asmt-sequence-startup',
        title: 'Put the start-up steps in order',
        kind: 'sequence-procedure',
        score: 85,
        status: 'passed',
        submittedAt: '16 Sep 2026',
      },
      {
        id: 'asmt-diagnose-pressure',
        title: 'The machine has lost pressure. Talk through it.',
        kind: 'diagnose-by-voice',
        score: null,
        status: 'scheduled',
        submittedAt: null,
      },
    ],
    badges: [
      {
        id: 'badge-safety',
        title: 'Machine safety',
        awardedAt: '15 Sep 2026',
      },
      {
        id: 'badge-hpu-basics',
        title: 'Power unit basics',
        awardedAt: '16 Sep 2026',
      },
    ],
  },
  {
    userId: 'u-priya',
    name: 'Priya Nair',
    employeeId: 'EMP-74893',
    profession: 'Automation & PLC Controls Specialist',
    skillLevel: 'Level 2 (Certified)',
    deptName: 'Electrical & Automation',
    learningMode: 'speech',
    language: 'English',
    isFastTrack: false,
    progress: 91,
    weakest: null,
    planTitle: 'Industrial PLC Maintenance & Sensor Loops',
    planId: 'plan-plc-l2',
    modules: [
      {
        seq: 1,
        title: 'PLC rack layout and power rail verification',
        completedAt: '10 Sep 2026',
      },
      {
        seq: 2,
        title: 'Discrete and analog input/output wiring',
        completedAt: '12 Sep 2026',
      },
      {
        seq: 3,
        title: 'Ladder logic online monitoring and forced I/O',
        completedAt: '14 Sep 2026',
      },
      {
        seq: 4,
        title: 'Inductive proximity and optical sensor alignment',
        completedAt: '16 Sep 2026',
      },
    ],
    skillProfile: {
      updatedAt: '17 Sep 2026',
      strengths: ['Ladder logic tracing', 'Sensor calibration', 'I/O verification'],
      weaknesses: ['Fieldbus communication diagnostics'],
    },
    assessments: [
      {
        id: 'asmt-plc-io',
        title: 'Proximity sensor terminal assignment',
        kind: 'identify-part',
        score: 95,
        status: 'passed',
        submittedAt: '12 Sep 2026',
      },
      {
        id: 'asmt-plc-estop',
        title: 'PLC emergency stop reset sequence',
        kind: 'sequence-procedure',
        score: 100,
        status: 'passed',
        submittedAt: '14 Sep 2026',
      },
      {
        id: 'asmt-plc-voice',
        title: 'Conveyor indexing error diagnosis',
        kind: 'diagnose-by-voice',
        score: 92,
        status: 'passed',
        submittedAt: '16 Sep 2026',
      },
    ],
    badges: [
      {
        id: 'badge-plc-foundations',
        title: 'Automation fundamentals',
        awardedAt: '12 Sep 2026',
      },
      {
        id: 'badge-sensor-loops',
        title: 'Sensor loop check',
        awardedAt: '14 Sep 2026',
      },
      {
        id: 'badge-plc-faults',
        title: 'PLC fault finder',
        awardedAt: '16 Sep 2026',
      },
    ],
  },
  {
    userId: 'u-suresh',
    name: 'Suresh Rao',
    employeeId: 'EMP-74894',
    profession: 'Mechanical Maintenance Fitter',
    skillLevel: 'Level 1 (Foundation)',
    deptName: 'Mechanical Maintenance',
    learningMode: 'text',
    language: 'Marathi (मराठी)',
    isFastTrack: true,
    progress: 64,
    weakest: 'Safety',
    planTitle: 'Mechanical Drive Trains & Bearing Service',
    planId: 'plan-mech-l1',
    modules: [
      {
        seq: 1,
        title: 'Shaft runout and dial indicator basics',
        completedAt: '11 Sep 2026',
      },
      {
        seq: 2,
        title: 'Deep groove ball bearing removal and press fitting',
        completedAt: '14 Sep 2026',
      },
      {
        seq: 3,
        title: 'Flexible coupling alignment and gap tolerances',
        completedAt: null,
      },
    ],
    skillProfile: {
      updatedAt: '16 Sep 2026',
      strengths: ['Shaft alignment', 'Bearing replacement'],
      weaknesses: ['Lockout tagout adherence', 'Guard re-installation'],
    },
    assessments: [
      {
        id: 'asmt-mech-bearing',
        title: 'Bearing race inspection',
        kind: 'identify-part',
        score: 80,
        status: 'passed',
        submittedAt: '14 Sep 2026',
      },
      {
        id: 'asmt-mech-align',
        title: 'Dial indicator shaft alignment procedure',
        kind: 'sequence-procedure',
        score: 78,
        status: 'passed',
        submittedAt: '15 Sep 2026',
      },
      {
        id: 'asmt-mech-voice',
        title: 'Abnormal gearbox vibration check protocol',
        kind: 'diagnose-by-voice',
        score: null,
        status: 'pending',
        submittedAt: null,
      },
    ],
    badges: [
      {
        id: 'badge-bearing-mount',
        title: 'Bearing mounting basics',
        awardedAt: '14 Sep 2026',
      },
    ],
  },
  {
    userId: 'u-deepa',
    name: 'Deepa Verma',
    employeeId: 'EMP-74895',
    profession: 'Industrial Electrical Maintenance',
    skillLevel: 'Level 1 (Foundation)',
    deptName: 'Electrical Maintenance',
    learningMode: 'speech',
    language: 'Hindi (हिन्दी)',
    isFastTrack: true,
    progress: 57,
    weakest: 'Machine setup',
    planTitle: '415V Switchgear & Motor Control Centers',
    planId: 'plan-elec-l1',
    modules: [
      {
        seq: 1,
        title: '3-phase AC motor insulation resistance testing',
        completedAt: '12 Sep 2026',
      },
      {
        seq: 2,
        title: 'Direct-on-line (DOL) starter contactor inspection',
        completedAt: '15 Sep 2026',
      },
      {
        seq: 3,
        title: 'Control transformer and 24V DC auxiliary circuit setup',
        completedAt: null,
      },
      {
        seq: 4,
        title: 'Thermal overload relay calibration and trip curve',
        completedAt: null,
      },
    ],
    skillProfile: {
      updatedAt: '16 Sep 2026',
      strengths: ['Motor insulation testing', 'Contactor replacement'],
      weaknesses: ['Control transformer setup', 'Panel wiring schematics'],
    },
    assessments: [
      {
        id: 'asmt-elec-contactor',
        title: 'Star-delta starter contactor bank identification',
        kind: 'identify-part',
        score: 88,
        status: 'passed',
        submittedAt: '15 Sep 2026',
      },
      {
        id: 'asmt-elec-loto',
        title: 'De-energization & voltage proving sequence',
        kind: 'sequence-procedure',
        score: 92,
        status: 'passed',
        submittedAt: '15 Sep 2026',
      },
      {
        id: 'asmt-elec-voice',
        title: 'Overload relay trip troubleshooting',
        kind: 'diagnose-by-voice',
        score: null,
        status: 'scheduled',
        submittedAt: null,
      },
    ],
    badges: [
      {
        id: 'badge-hv-safety',
        title: 'High-voltage safety',
        awardedAt: '12 Sep 2026',
      },
      {
        id: 'badge-starter-wiring',
        title: 'Motor starter wiring',
        awardedAt: '15 Sep 2026',
      },
    ],
  },
];

interface WorkerFileDashboardProps {
  initialWorkerId?: string;
  isManagerView?: boolean;
}

export function WorkerFileDashboard({
  initialWorkerId = 'u-ravi',
  isManagerView = false,
}: WorkerFileDashboardProps) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState(initialWorkerId);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWorkers = WORKERS_DATA.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.profession.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.employeeId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedWorker =
    WORKERS_DATA.find((w) => w.userId === selectedId) || WORKERS_DATA[0];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* Breadcrumb / Top Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={isManagerView ? '/dashboard' : '/plan'}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            &larr; {isManagerView ? t('manager.dashboard') : t('common.back')}
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-xs font-medium text-foreground">
            {isManagerView ? t('manager.workers') : 'My Worker File'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Org: Bharat Precision Engineering</span>
          <span>&bull;</span>
          <span>Dept: {selectedWorker.deptName}</span>
        </div>
      </div>

      {/* Main Grid: Roster on Left (Manager view only) + Worker File Details on Right */}
      <div className={`grid gap-8 ${isManagerView ? 'lg:grid-cols-[300px_1fr]' : ''}`}>
        {/* Left Column: Department Worker Roster (Manager view) */}
        {isManagerView && (
          <aside className="flex flex-col border-r border-border pr-6">
            <div className="mb-4">
              <h1 className="text-lg font-semibold text-foreground">
                {t('manager.workers')}
              </h1>
              <p className="text-xs text-muted-foreground">
                {WORKERS_DATA.length} technicians in department
              </p>
            </div>

            <div className="mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name or trade..."
                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
              />
            </div>

            <ul className="flex flex-col gap-1">
              {filteredWorkers.map((worker) => {
                const isSelected = worker.userId === selectedWorker.userId;
                return (
                  <li key={worker.userId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(worker.userId)}
                      className={`w-full rounded-lg p-3 text-left transition ${
                        isSelected
                          ? 'bg-muted border border-border'
                          : 'hover:bg-muted/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {worker.name}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {worker.progress}%
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {worker.profession}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{worker.employeeId}</span>
                        <span
                          className={`font-medium ${
                            worker.weakest ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {worker.weakest ?? t('manager.noGap')}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}

        {/* Right Column: Grounded Worker File / Dossier Record */}
        <section className="flex flex-col gap-6">
          {/* Identity & Current Assignment Card */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-2xl font-semibold text-foreground">
                    {selectedWorker.name}
                  </h2>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {selectedWorker.employeeId}
                  </span>
                  {selectedWorker.isFastTrack && (
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                      {t('worker.fastTrack')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground">
                  {selectedWorker.profession} &bull;{' '}
                  <span className="text-muted-foreground">{selectedWorker.skillLevel}</span>
                </p>
              </div>

              {/* Progress pill */}
              <div className="flex flex-col items-start sm:items-end">
                <span className="text-xs text-muted-foreground">Curriculum Progress</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-foreground">
                    {selectedWorker.progress}%
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Metadata Strip */}
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Department</dt>
                <dd className="mt-0.5 text-xs font-medium text-foreground">
                  {selectedWorker.deptName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Preferred Mode</dt>
                <dd className="mt-0.5 text-xs font-medium text-foreground capitalize">
                  {selectedWorker.learningMode === 'speech' ? 'Voice-first (Hands-free)' : 'Reading (Text)'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Language</dt>
                <dd className="mt-0.5 text-xs font-medium text-foreground">
                  {selectedWorker.language}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Active Plan ID</dt>
                <dd className="mt-0.5 text-xs font-mono text-muted-foreground">
                  {selectedWorker.planId}
                </dd>
              </div>
            </dl>
          </div>

          {/* Section 1: Assigned Learning Plan */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t('worker.plan')} &bull; {selectedWorker.planTitle}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('worker.modulesDone', {
                    done: selectedWorker.modules.filter((m) => m.completedAt).length,
                    total: selectedWorker.modules.length,
                  })}
                </p>
              </div>
            </div>

            <ol className="mt-4 flex flex-col divide-y divide-border">
              {selectedWorker.modules.map((m) => (
                <li key={m.seq} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        m.completedAt
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {m.seq}
                    </span>
                    <span className="text-sm text-foreground">{m.title}</span>
                  </div>
                  <div className="text-xs">
                    {m.completedAt ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Done ({m.completedAt})
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Pending</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Section 2: Async Skill Profile (Strengths & Gaps) */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Evaluated Competency Profile
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Derived from speech questions and assessment reasoning by the async profiler
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                Updated: {selectedWorker.skillProfile.updatedAt}
              </span>
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {/* Strengths */}
              <div>
                <h4 className="text-xs font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  {t('worker.strengths')}
                </h4>
                <ul className="mt-2 flex flex-col gap-2">
                  {selectedWorker.skillProfile.strengths.map((s) => (
                    <li
                      key={s}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-foreground"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Weaknesses / Skill Gaps */}
              <div>
                <h4 className="text-xs font-medium uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  {t('worker.weaknesses')}
                </h4>
                <ul className="mt-2 flex flex-col gap-2">
                  {selectedWorker.skillProfile.weaknesses.map((w) => (
                    <li
                      key={w}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-foreground"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Section 3: Assessments & Verification */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground">
              {t('worker.assessment')} &bull; Skill Verifications
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Technical assessments covering part identification, procedure sequencing, and diagnostic voice explanation
            </p>

            <ul className="mt-4 flex flex-col divide-y divide-border">
              {selectedWorker.assessments.map((asmt) => (
                <li key={asmt.id} className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-sm font-medium text-foreground">{asmt.title}</span>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="capitalize">{asmt.kind.replace('-', ' ')}</span>
                      {asmt.submittedAt && (
                        <>
                          <span>&bull;</span>
                          <span>Completed {asmt.submittedAt}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    {asmt.score !== null ? (
                      <span className="rounded bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {asmt.score}% Passed
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground capitalize">
                        {asmt.status}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Section 4: Earned Badges */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground">
              {t('worker.badges')} &bull; Awarded Qualifications
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Micro-credentials earned on successful completion of SOP modules and assessments
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              {selectedWorker.badges.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('worker.noBadges')}</p>
              ) : (
                selectedWorker.badges.map((badge) => (
                  <div
                    key={badge.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3.5 py-2"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      &check;
                    </span>
                    <div>
                      <span className="text-xs font-medium text-foreground">{badge.title}</span>
                      <p className="text-xs text-muted-foreground">{badge.awardedAt}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
