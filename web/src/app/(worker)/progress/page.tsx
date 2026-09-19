'use client';

import { WorkerHeader } from '@/components/worker/worker-header';
import { useI18n } from '@/i18n/provider';
import { fixtureBadges, fixturePlan, fixtureSkillProfile } from '@/lib/fixtures';

/**
 * Progress, framed as competence rather than completion — strengths and gaps
 * come from the async skill profiler, which reads what the worker actually
 * asked and retried, not just which modules were ticked off.
 *
 * Badges are shown for every worker on every org tier, free included.
 */
export default function ProgressPage() {
  const { t } = useI18n();

  const done = fixturePlan.modules.filter((m) => m.completedAt).length;

  return (
    <main className="flex min-h-screen flex-col bg-background pb-10">
      <WorkerHeader
        title={t('worker.progress')}
        backHref="/plan"
        backLabel={t('common.back')}
      />

      <div className="px-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-4xl font-semibold text-foreground">
              {done}/{fixturePlan.modules.length}
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              {t('worker.modulesDone', { done, total: fixturePlan.modules.length })}
            </p>
          </div>
          <a
            href="/worker-file"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{t('worker.workerFileDossier')}</span>
          </a>
        </div>
      </div>

      <Section title={t('worker.strengths')}>
        {fixtureSkillProfile.strengths.map((item) => (
          <Row key={item} label={item} tone="success" />
        ))}
      </Section>

      <Section title={t('worker.weaknesses')}>
        {fixtureSkillProfile.weaknesses.map((item) => (
          <Row key={item} label={item} tone="warning" />
        ))}
      </Section>

      <Section title={t('worker.badges')}>
        {fixtureBadges.length === 0 ? (
          <p className="text-base text-muted-foreground">{t('worker.noBadges')}</p>
        ) : (
          fixtureBadges.map((badge) => <Row key={badge.badgeId} label={badge.title} tone="success" />)
        )}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 pt-8">
      <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ label, tone }: { label: string; tone: 'success' | 'warning' }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-4">
      <span
        aria-hidden
        className={`size-2.5 shrink-0 rounded-full ${
          tone === 'success' ? 'bg-success' : 'bg-warning'
        }`}
      />
      <span className="text-base text-foreground">{label}</span>
    </div>
  );
}
