'use client';

import { useState } from 'react';

import { useI18n } from '@/i18n/provider';
import { getDeptAggregate } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

/**
 * Manager dashboard: the department's numbers, plus a panel for asking about
 * them.
 *
 * Everything on the left is read from ONE materialized AGG#DEPT# item
 * (DATA-MODEL Decision 1, access patterns M2/M3). Nothing here fans out over
 * workers — a dashboard assembled by querying GSI1 and looping GetItems per
 * worker is O(workforce) per page view and gets slower exactly as an org grows
 * into a paying customer.
 *
 * Dense layout is deliberate and stays on this side of the product: worker
 * screens are a consumer app, manager and admin are a console.
 */
export default function ManagerDashboardPage() {
  const { t } = useI18n();
  // No deptId: the handler resolves the caller's own department from the
  // verified session. A manager never names their department in a request.
  const { data, error, loading } = useApi(() => getDeptAggregate(), []);

  if (loading) return <DashboardMessage>{t('common.loading')}</DashboardMessage>;
  if (error || !data) return <DashboardMessage tone="error">{error ?? t('common.error')}</DashboardMessage>;

  const agg = data.aggregate;
  const attempted = agg.assessmentsPassed + agg.assessmentsFailed;
  const passRate = attempted === 0 ? 0 : Math.round((agg.assessmentsPassed / attempted) * 100);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t('manager.dashboard')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('manager.period')}: {agg.period}
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <dl className="grid grid-cols-2 gap-6 border-b border-border pb-8 sm:grid-cols-3">
            <Metric label={t('manager.workers')} value={agg.workerCount} />
            <Metric label={t('manager.passRate')} value={`${passRate}%`} />
            <Metric label={t('manager.assessmentsPassed')} value={agg.assessmentsPassed} />
          </dl>

          <section className="pt-8">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t('manager.skillGaps')}
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {Object.entries(agg.skillGaps)
                .sort((a, b) => b[1] - a[1])
                .map(([skill, pct]) => (
                  <li key={skill}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-foreground">{skill}</span>
                      <span className="text-xs text-muted-foreground">
                        {t('manager.belowTarget', { pct })}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${
                          pct > 35 ? 'bg-danger' : pct > 20 ? 'bg-warning' : 'bg-success'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          </section>

          {/*
            The per-worker roster (M4 drill-down) has no route yet, so there is
            nothing real to list. It renders as visibly pending rather than as a
            table of invented names: a screen that looks finished and is not is
            worse on stage than one that says what it is waiting for.
          */}
          <section className="pt-8">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t('manager.workers')}
            </h2>
            <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              {t('manager.rosterPending')}
            </p>
          </section>
        </div>

        <AskAboutTeam />
      </div>
    </main>
  );
}

/** Loading and error both need the page frame, not a bare string in the corner. */
function DashboardMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'error';
}) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <p className={`text-sm ${tone === 'error' ? 'text-danger' : 'text-muted-foreground'}`}>
        {children}
      </p>
    </main>
  );
}

function Metric({
  label,
  value,
  alert,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 text-3xl font-semibold ${alert ? 'text-danger' : 'text-foreground'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Ask-about-your-team panel.
 *
 * Deliberately inert: the composer is disabled and says so. There is no agent
 * behind this — the roster is fixed at four and none of them serve a manager
 * chat surface — so it must not render fabricated answers or "action confirmed"
 * receipts implying the system messaged someone or edited a document. An
 * unbuilt capability is stated, not mocked.
 */
function AskAboutTeam() {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  return (
    <aside className="flex h-fit flex-col rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{t('manager.askTitle')}</h2>

      <p className="mt-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {t('manager.suggested')}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {(['q1', 'q2', 'q3'] as const).map((key) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => setDraft(t(`manager.${key}`))}
              className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
            >
              {t(`manager.${key}`)}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2 rounded-md border border-border px-3 py-2">
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
