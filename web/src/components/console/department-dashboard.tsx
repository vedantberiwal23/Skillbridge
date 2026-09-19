'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { cn } from 'cn';

import { useI18n } from '@/i18n/provider';
import { getDeptAggregate, getTeam } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { DeptAggregate, TeamMember } from '@/lib/types';
import { useTour } from '@/components/tour/tour-provider';
import { Ring } from './ring';

/**
 * One department's dashboard: where it stands, what to do about it, and who is
 * in it. Shared by the manager console and the admin overview.
 *
 * Every number comes from the materialized AGG#DEPT# item (DATA-MODEL Decision
 * 1, access patterns M2/M3) — one GetItem for this month and one for last month
 * to show the change. The roster is a separate single GSI1 Query that returns
 * profile fields only. Nothing here fans out per worker: a dashboard that loops
 * GetItems over the workforce gets slower exactly as an org grows into a paying
 * customer.
 *
 * Dense layout is deliberate: worker screens are a consumer app, manager and
 * admin are a console.
 */

const CRITICAL = 35;
const WATCH = 20;
const PASS_TARGET = 75;

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function previousPeriod(period: string) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

function periodLabel(period: string) {
  const [y, m] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

function passRate(agg: DeptAggregate | null | undefined): number | null {
  if (!agg) return null;
  const attempted = agg.assessmentsPassed + agg.assessmentsFailed;
  return attempted === 0 ? null : Math.round((agg.assessmentsPassed / attempted) * 100);
}

function severity(pct: number): 'critical' | 'watch' | 'ok' {
  return pct > CRITICAL ? 'critical' : pct > WATCH ? 'watch' : 'ok';
}

export function DepartmentDashboard({
  deptId,
  heading,
  gettingStarted = false,
  rosterHref,
}: {
  deptId: string;
  /** Title block (and department switcher) rendered left of the period switch. */
  heading: React.ReactNode;
  gettingStarted?: boolean;
  /** Where a roster row links to. Omitted, rows are not links. */
  rosterHref?: string;
}) {
  const { t } = useI18n();
  const [thisMonth] = useState(currentPeriod);
  const [period, setPeriod] = useState(thisMonth);

  // orgId never travels; deptId is checked against the caller's scope
  // server-side (lib/scope.ts), so naming it here grants nothing.
  const current = useApi(() => getDeptAggregate(deptId, period), [deptId, period]);
  const previous = useApi(() => getDeptAggregate(deptId, previousPeriod(period)), [deptId, period]);
  const team = useApi(() => getTeam(deptId), [deptId]);

  const header = (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">{heading}</div>
      <PeriodSwitch value={period} thisMonth={thisMonth} onChange={setPeriod} />
    </header>
  );

  if (current.loading && !current.data) return <DashboardSkeleton header={header} />;
  if (current.error || !current.data) {
    return (
      <>
        {header}
        <p className="mt-6 rounded-xl border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-danger">
          {current.error ?? t('common.error')}
        </p>
      </>
    );
  }

  const agg = current.data.aggregate;
  const prev = previous.data?.aggregate ?? null;
  const members = team.data?.members ?? [];

  return (
    <>
      {header}

      {gettingStarted ? <GettingStarted hasWorkers={members.length > 0} /> : null}

      <Kpis agg={agg} prev={prev} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="flex flex-col gap-6">
          <SkillGaps agg={agg} prev={prev} />
          <Outcomes agg={agg} />
        </div>
        <div className="flex flex-col gap-6">
          <NeedsAttention agg={agg} members={members} teamLoaded={!team.loading} />
          <AskAboutTeam />
        </div>
      </div>

      <Roster
        members={members}
        loading={team.loading && !team.data}
        error={team.error}
        truncated={team.data?.truncated ?? false}
        headcount={agg.workerCount}
        href={rosterHref}
      />
    </>
  );
}

/* ── header ─────────────────────────────────────────────────────────────── */

function PeriodSwitch({
  value,
  thisMonth,
  onChange,
}: {
  value: string;
  thisMonth: string;
  onChange: (period: string) => void;
}) {
  const options = [thisMonth, previousPeriod(thisMonth)];
  return (
    <div
      data-tour="period"
      role="radiogroup"
      aria-label="Reporting period"
      className="inline-flex self-start rounded-xl border border-border bg-card p-1 sm:self-auto"
    >
      {options.map((option, i) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm transition-colors',
            value === option
              ? 'bg-foreground font-medium text-background'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {i === 0 ? 'This month' : periodLabel(option)}
        </button>
      ))}
    </div>
  );
}

/* ── getting started ─────────────────────────────────────────────────────── */

const CHECKLIST_KEY = 'sb.manager.checklist.dismissed';

/**
 * First-run checklist. Each item is either verifiable here (the tour has been
 * seen, the department has workers) or a plain pointer — nothing is ticked on
 * the manager's behalf for work the system cannot see.
 */
function GettingStarted({ hasWorkers }: { hasWorkers: boolean }) {
  const { start } = useTour();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(CHECKLIST_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [toured] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('sb.tour.manager.v1') === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(CHECKLIST_KEY, '1');
    } catch {
      // The checklist simply reappears next visit.
    }
  };

  const items = [
    {
      done: toured,
      title: 'Take the two-minute tour',
      body: 'See what each part of this console tells you.',
      action: (
        <button type="button" onClick={start} className="text-sm font-semibold text-primary hover:underline">
          Start tour
        </button>
      ),
    },
    {
      done: hasWorkers,
      title: 'Get your team on SkillBridge',
      body: 'Your org admin sends invites by SMS. Workers appear below once they join.',
      action: null,
    },
    {
      done: false,
      title: 'Organise people into groups',
      body: 'Crews, shifts or lines — so you can see who needs what at a glance.',
      action: (
        <Link href="/team" className="text-sm font-semibold text-primary hover:underline">
          Set up groups
        </Link>
      ),
    },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <section
      aria-labelledby="getting-started"
      className="relative mt-6 overflow-hidden rounded-2xl border border-border bg-card p-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss getting started"
        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-2">
        <h2 id="getting-started" className="text-sm font-semibold text-foreground">
          Getting started
        </h2>
        <span className="font-data text-xs text-muted-foreground">
          {doneCount}/{items.length}
        </span>
      </div>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.title}
            className={cn(
              'flex gap-3 rounded-xl border p-3.5',
              'border-border'
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                item.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
              )}
            >
              {item.done ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <div className="min-w-0">
              <p className={cn('text-sm font-medium', item.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                {item.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              {!item.done && item.action ? <div className="mt-2">{item.action}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── KPIs ────────────────────────────────────────────────────────────────── */

function Kpis({ agg, prev }: { agg: DeptAggregate; prev: DeptAggregate | null }) {
  const { t } = useI18n();
  const rate = passRate(agg);
  const prevRate = passRate(prev);
  const attempted = agg.assessmentsPassed + agg.assessmentsFailed;
  const prevAttempted = prev ? prev.assessmentsPassed + prev.assessmentsFailed : 0;
  const worst = Object.entries(agg.skillGaps).sort((a, b) => b[1] - a[1])[0];

  return (
    <dl data-tour="kpis" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label={t('manager.workers')}
        value={String(agg.workerCount)}
        delta={prev && prev.workerCount > 0 ? agg.workerCount - prev.workerCount : null}
        hint="in this department"
      />
      <Kpi
        label={t('manager.passRate')}
        value={rate === null ? '—' : `${rate}%`}
        delta={rate !== null && prevRate !== null ? rate - prevRate : null}
        deltaUnit="pts"
        hint={rate === null ? 'no assessments yet' : `target ${PASS_TARGET}%`}
        tone={rate !== null && rate < PASS_TARGET ? 'warning' : undefined}
      />
      <Kpi
        label="Assessments taken"
        value={String(attempted)}
        delta={prevAttempted > 0 ? attempted - prevAttempted : null}
        hint={`${agg.assessmentsPassed} passed · ${agg.assessmentsFailed} failed`}
      />
      <Kpi
        label={t('manager.weakest')}
        value={worst ? `${worst[1]}%` : '—'}
        hint={worst ? `${worst[0]} · below target` : t('manager.noGap')}
        tone={worst && severity(worst[1]) === 'critical' ? 'danger' : undefined}
      />
    </dl>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
  deltaUnit = '',
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  deltaUnit?: string;
  tone?: 'warning' | 'danger';
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2 flex items-baseline gap-2">
        <span
          className={cn(
            'font-data text-3xl font-semibold tracking-tight',
            tone === 'danger' ? 'text-danger' : 'text-foreground'
          )}
        >
          {value}
        </span>
        {delta !== null && delta !== undefined && delta !== 0 ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-semibold',
              delta > 0 ? 'text-primary' : 'text-danger'
            )}
          >
            {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta)}
            {deltaUnit ? ` ${deltaUnit}` : ''}
          </span>
        ) : null}
      </dd>
      {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ── skill gaps ──────────────────────────────────────────────────────────── */

function SkillGaps({ agg, prev }: { agg: DeptAggregate; prev: DeptAggregate | null }) {
  const { t } = useI18n();
  const gaps = Object.entries(agg.skillGaps).sort((a, b) => b[1] - a[1]);

  return (
    <section
      id="skill-gaps"
      data-tour="skill-gaps"
      aria-labelledby="skill-gaps-title"
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="skill-gaps-title" className="text-sm font-semibold text-foreground">
          {t('manager.skillGaps')}
        </h2>
        <Legend />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Share of assessed workers below target, worst first.
      </p>

      {gaps.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No gaps recorded for this period. They appear as workers take assessments and ask the tutor questions.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-4">
          {gaps.map(([skill, pct]) => {
            const level = severity(pct);
            const before = prev?.skillGaps[skill];
            const change = before === undefined ? null : pct - before;
            return (
              <li key={skill}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-foreground">{skill}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    {change !== null && change !== 0 ? (
                      <span className={cn('text-[11px] font-medium', change < 0 ? 'text-primary' : 'text-danger')}>
                        {change < 0 ? '▼' : '▲'} {Math.abs(change)}
                      </span>
                    ) : null}
                    <span className="font-data text-sm font-semibold text-foreground">{pct}%</span>
                  </span>
                </div>
                <div
                  className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={t('manager.belowTarget', { pct })}
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-500',
                      level === 'critical' ? 'bg-danger' : 'bg-foreground/70'
                    )}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Legend() {
  const items = [
    ['bg-danger', `Needs a refresher (over ${CRITICAL}%)`],
    ['bg-foreground/70', 'Within range'],
  ] as const;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map(([color, label]) => (
        <li key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span aria-hidden className={cn('size-2 rounded-full', color)} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/* ── outcomes ────────────────────────────────────────────────────────────── */

function Outcomes({ agg }: { agg: DeptAggregate }) {
  const total = agg.assessmentsPassed + agg.assessmentsFailed;
  const rate = passRate(agg);
  return (
    <section aria-labelledby="outcomes-title" className="rounded-2xl border border-border bg-card p-5">
      <h2 id="outcomes-title" className="text-sm font-semibold text-foreground">
        Assessment outcomes
      </h2>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No assessments taken in this period yet.</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-8">
          <Ring
            value={rate}
            size={96}
            stroke={9}
            alert={rate !== null && rate < PASS_TARGET}
            label="Pass rate"
            sublabel={`Target ${PASS_TARGET}%`}
          />
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Passed</dt>
            <dd className="font-data font-semibold text-foreground">{agg.assessmentsPassed}</dd>
            <dt className="text-muted-foreground">Failed</dt>
            <dd className="font-data font-semibold text-foreground">{agg.assessmentsFailed}</dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-data font-semibold text-foreground">{total}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}

/* ── needs attention ─────────────────────────────────────────────────────── */

/**
 * The numbers above, turned into a short to-do list. Every item is derived from
 * data on this page; nothing here claims the system has done anything.
 */
function NeedsAttention({
  agg,
  members,
  teamLoaded,
}: {
  agg: DeptAggregate;
  members: TeamMember[];
  teamLoaded: boolean;
}) {
  const { t } = useI18n();
  const items: { tone: 'danger' | 'warning'; title: string; body: string }[] = [];

  for (const [skill, pct] of Object.entries(agg.skillGaps).sort((a, b) => b[1] - a[1])) {
    if (pct > CRITICAL) {
      items.push({
        tone: 'danger',
        title: `Refresher on ${skill}`,
        body: `${pct}% of assessed workers are below target.`,
      });
    }
  }
  const rate = passRate(agg);
  if (rate !== null && rate < PASS_TARGET) {
    items.push({
      tone: 'warning',
      title: 'Pass rate under target',
      body: `${rate}% this period against a ${PASS_TARGET}% target.`,
    });
  }
  const notStarted = members.filter((m) => !m.profession);
  if (teamLoaded && notStarted.length > 0) {
    items.push({
      tone: 'warning',
      title: `${notStarted.length} ${notStarted.length === 1 ? 'worker has' : 'workers have'} not finished setup`,
      body: 'They joined but have not picked a trade, so no training plan has started.',
    });
  }

  return (
    <section
      data-tour="attention"
      aria-labelledby="attention-title"
      className="rounded-2xl border border-border bg-card p-5"
    >
      <h2 id="attention-title" className="text-sm font-semibold text-foreground">
        {t('manager.needAttention')}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-primary" /> Nothing needs you right now.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {items.map((item) => (
            <li
              key={item.title}
              className={cn(
                'flex gap-3 rounded-xl p-3',
                'border border-border'
              )}
            >
              <AlertTriangle
                className={cn('mt-0.5 size-4 shrink-0', item.tone === 'danger' ? 'text-danger' : 'text-muted-foreground')}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── roster ──────────────────────────────────────────────────────────────── */

function Roster({
  members,
  loading,
  error,
  truncated,
  headcount,
  href,
}: {
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
  headcount: number;
  href?: string;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'setup'>('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (filter === 'active' && !m.profession) return false;
      if (filter === 'setup' && m.profession) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.profession ?? '').toLowerCase().includes(q) ||
        (m.skillLevel ?? '').toLowerCase().includes(q)
      );
    });
  }, [members, query, filter]);

  const setupCount = members.filter((m) => !m.profession).length;

  return (
    <section
      data-tour="roster"
      aria-labelledby="roster-title"
      className="mt-6 rounded-2xl border border-border bg-card"
    >
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="roster-title" className="text-sm font-semibold text-foreground">
            Your team
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${members.length} joined${headcount > members.length ? ` of ${headcount} on the headcount` : ''}${truncated ? ' · showing the first 200' : ''}`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            {(
              [
                ['all', 'All'],
                ['active', 'Training'],
                ['setup', `Not set up${setupCount ? ` (${setupCount})` : ''}`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  'rounded-md px-2.5 py-1 transition-colors',
                  filter === value ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 focus-within:border-primary">
            <Search className="size-3.5 text-muted-foreground" />
            <span className="sr-only">Search workers</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or trade"
              className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground sm:w-48"
            />
          </label>
        </div>
      </div>

      {error ? (
        <p className="p-5 text-sm text-danger">{error}</p>
      ) : loading ? (
        <div className="flex flex-col gap-2 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
            <UserPlus className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">No one has joined yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Ask your organization admin to send invites. Each worker appears here the moment they redeem theirs.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">No workers match.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((m) => {
            const row = (
              <>
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{m.name || 'Unnamed worker'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.profession ? titleCase(m.profession) : 'Trade not chosen yet'}
                  </p>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:block">{m.skillLevel ?? '—'}</span>
                <StatusPill active={Boolean(m.profession)} />
                {href ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : null}
              </>
            );
            return (
              <li key={m.userId}>
                {href ? (
                  <Link href={href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50">
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-3">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function titleCase(value: string) {
  return value === value.toUpperCase()
    ? value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : value;
}

export function Avatar({ name }: { name: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
      {initials}
    </span>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className={cn('size-1.5 rounded-full', active ? 'bg-primary' : 'bg-border')} />
      {active ? 'Training' : 'Not set up'}
    </span>
  );
}

/* ── ask panel ───────────────────────────────────────────────────────────── */

/**
 * Ask-about-your-team panel.
 *
 * Deliberately inert: the composer is disabled and says so. There is no agent
 * behind this, so it must not render fabricated answers or receipts implying
 * the system messaged someone. An unbuilt capability is stated, not mocked.
 */
function AskAboutTeam() {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  return (
    <aside data-tour="ask" className="flex h-fit flex-col rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t('manager.askTitle')}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Soon
        </span>
      </div>

      <p className="mt-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t('manager.suggested')}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {(['q1', 'q2', 'q3'] as const).map((key) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => setDraft(t(`manager.${key}`))}
              className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {t(`manager.${key}`)}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('manager.askPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{t('manager.askUnavailable')}</p>
    </aside>
  );
}

/* ── loading ─────────────────────────────────────────────────────────────── */

function DashboardSkeleton({ header }: { header: React.ReactNode }) {
  return (
    <div aria-busy>
      {header}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
