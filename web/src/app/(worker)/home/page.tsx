'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { fixtureBadges, fixtureOpportunities, fixtureSkillProfile } from '@/lib/fixtures';
import { useProfile } from '@/components/providers/profile-provider';
import { TRADES_CATALOG, type CurriculumModule, type TradeTrack } from '@/data/curriculum';

/** All modules across all stages, in order — the flat list "progress" means. */
function allModules(trade: TradeTrack): CurriculumModule[] {
  return trade.stages.flatMap((stage) => stage.items);
}

function firstName(fullName: string): string {
  return fullName.split(' ')[0];
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const TODAY = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export default function HomePage() {
  const { profile } = useProfile();
  // Same localStorage keys /plan uses, so the progress shown here always
  // matches what the worker sees when they tap through to keep learning.
  const [selectedTradeKey] = useState<string>(() => {
    if (typeof window === 'undefined') return 'hydraulics';
    try {
      const saved = localStorage.getItem('sb_worker_trade_id');
      return saved && TRADES_CATALOG[saved] ? saved : 'hydraulics';
    } catch {
      return 'hydraulics';
    }
  });

  const [completedLessonIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ['lesson-hpu-overview'];
    try {
      const saved = localStorage.getItem('sb_completed_modules');
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : ['lesson-hpu-overview'];
    } catch {
      return ['lesson-hpu-overview'];
    }
  });

  const activeTrade = TRADES_CATALOG[selectedTradeKey] ?? TRADES_CATALOG.hydraulics;

  const { completedCount, totalCount, nextModule, percent } = useMemo(() => {
    const modules = allModules(activeTrade);
    const completed = modules.filter((m) => completedLessonIds.includes(m.lessonId));
    const next = modules.find((m) => !completedLessonIds.includes(m.lessonId));
    const pct = modules.length === 0 ? 0 : Math.round((completed.length / modules.length) * 100);
    return {
      completedCount: completed.length,
      totalCount: modules.length,
      nextModule: next ?? modules[modules.length - 1],
      percent: pct,
    };
  }, [activeTrade, completedLessonIds]);

  const recommended = Object.values(TRADES_CATALOG)
    .filter((trade) => trade.id !== activeTrade.id)
    .slice(0, 2);

  const verifiedSkills = [...fixtureSkillProfile.strengths, ...fixtureBadges.map((b) => b.title)];
  const opportunity = fixtureOpportunities[0];
  const opportunityMatched = opportunity.requiredSkills.filter((s) => verifiedSkills.includes(s));
  const opportunityReadiness = Math.round(
    (opportunityMatched.length / opportunity.requiredSkills.length) * 100
  );

  return (
    <main className="mx-auto flex max-w-lg flex-col px-5 pt-8">
      {/* ---- Greeting — a real date instead of a wave emoji does more work
           to feel like a considered product than decoration would. ---- */}
      <div className="flex items-baseline justify-between">
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {greeting()}, {firstName((profile?.name ?? ''))}
        </p>
        <p className="font-data text-xs text-muted-foreground">{TODAY.format(new Date())}</p>
      </div>
      <p className="mt-0.5 text-base text-muted-foreground">{profile?.profession ?? ''}</p>

      {/* ---- Continue Learning — the one thing on this screen that should
           read as unmissable. No card border, no icon: the size of the
           number and the trade name are what carry it. ---- */}
      <Link href="/plan" className="group mt-8 block">
        <div className="rounded-2xl bg-foreground p-6 text-background transition-transform active:scale-[0.99]">
          <p className="font-data text-xs uppercase tracking-[0.16em] text-background/55">
            Continue learning
          </p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight">{activeTrade.name}</p>
              <p className="mt-1 text-sm text-background/65">Next: {nextModule.title}</p>
            </div>
            <p className="font-data shrink-0 text-3xl font-semibold leading-none">{percent}%</p>
          </div>
          <Progress value={percent} tone="success" className="mt-4 bg-background/15" />
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-background/55">
              {completedCount} of {totalCount} lessons done
            </p>
            <span className="flex items-center gap-1 text-sm font-semibold text-background transition-transform group-hover:translate-x-0.5">
              Continue <ArrowRight className="size-4" />
            </span>
          </div>
        </div>
      </Link>

      {/* ---- Recommended for you ---- */}
      {recommended.length > 0 ? (
        <section className="mt-9">
          <SectionLabel>Recommended for you</SectionLabel>
          <p className="mt-1 text-sm text-muted-foreground">
            Can help you become a Senior {activeTrade.name.split(' ')[0]}
          </p>
          <div className="mt-4 flex flex-col divide-y divide-border">
            {recommended.map((trade) => (
              <Link
                key={trade.id}
                href={`/learn/${trade.id}`}
                className="group flex items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-foreground">{trade.name}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{trade.industry}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- Your Skills — no icons, no badges. Just the list, weighted by
           what's actually true: done skills read plain, locked ones read
           quieter. The distinction does the work, not a decoration. ---- */}
      <section className="mt-9">
        <SectionLabel>Your skills</SectionLabel>
        <div className="mt-4 flex flex-col divide-y divide-border">
          {fixtureSkillProfile.strengths.map((skill) => (
            <div key={skill} className="flex min-h-11 items-center justify-between gap-3 py-2.5">
              <span className="text-base text-foreground">{skill}</span>
              <span className="text-sm font-medium text-primary">Verified</span>
            </div>
          ))}
          {fixtureSkillProfile.weaknesses.map((skill) => (
            <div
              key={skill}
              className="flex min-h-11 items-center justify-between gap-3 py-2.5 text-muted-foreground"
            >
              <span className="text-base">{skill}</span>
              <span className="flex items-center gap-1.5 text-sm">
                <Lock className="size-3.5" /> Locked
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Career Opportunity ---- */}
      <section className="mt-9 pb-8">
        <SectionLabel>Career opportunity</SectionLabel>
        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-semibold text-foreground">{opportunity.title}</p>
            <p className="font-data shrink-0 text-sm font-semibold text-primary">
              {opportunityReadiness}% ready
            </p>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {opportunity.location} · {opportunity.payRange}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {opportunity.requiredSkills.map((skill) => {
              const has = verifiedSkills.includes(skill);
              return (
                <div key={skill} className="flex items-center gap-2.5 text-sm">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      has ? 'bg-primary' : 'bg-border'
                    }`}
                  />
                  <span className={has ? 'text-foreground' : 'text-muted-foreground'}>{skill}</span>
                </div>
              );
            })}
          </div>
          <Button
            render={<Link href="/opportunities" />}
            size="xl"
            variant="outline"
            className="mt-5 w-full"
          >
            See what you need <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-data text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </h2>
  );
}
