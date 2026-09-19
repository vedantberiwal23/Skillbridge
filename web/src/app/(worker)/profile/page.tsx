'use client';

import { Award, BookOpen, Briefcase, TrendingUp } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { useProfile } from '@/components/providers/profile-provider';
import { getPlan } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import { useI18n } from '@/i18n/provider';
import { fixtureBadges, fixtureSkillProfile } from '@/lib/fixtures';

/**
 * The worker's "digital skill passport": identity and headline stats.
 *
 * Identity and plan progress are live — the profile comes from the shared
 * `/api/me` fetch, the module counts from `/api/plan`. Badges and the verified
 * skill ladder are still fixtures: badges have no route and no key builder, and
 * the skill profile is written by the profiler agent, which has a key builder
 * (`keys.skillProfile`) but nothing reading it back yet. Both are display-only
 * until those land, which is the sanctioned cut, not an oversight.
 */
export default function ProfilePage() {
  const { profile } = useProfile();
  const { t } = useI18n();
  const { data: planData } = useApi(() => getPlan(), []);

  const plan = planData?.plan ?? null;
  const modules = plan?.modules ?? [];
  const completedModules = modules.filter((m) => m.completedAt).length;

  const stats = [
    { icon: BookOpen, label: 'Courses completed', value: String(completedModules) },
    { icon: Award, label: 'Certificates', value: String(fixtureBadges.length) },
    { icon: TrendingUp, label: 'Skill level', value: profile?.skillLevel ?? '—' },
  ];

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 pt-8 pb-4">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-semibold text-primary">
          {(profile?.name ?? '')
            .split(' ')
            .filter(Boolean)
            .map((n) => n[0])
            .join('')}
        </div>
        <div>
          <p className="text-xl font-semibold text-foreground">{profile?.name ?? ''}</p>
          <p className="text-base text-muted-foreground">{profile?.profession ?? ''}</p>
        </div>
      </div>

      <Card className="gap-4 p-5">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          {fixtureSkillProfile.strengths.length} verified skills
        </p>
        <div className="flex flex-col gap-2.5">
          {fixtureSkillProfile.strengths.map((skill) => (
            <div key={skill} className="flex items-center justify-between text-base text-foreground">
              {skill}
              <span className="text-sm font-medium text-success">Verified</span>
            </div>
          ))}
          {fixtureSkillProfile.weaknesses.map((skill) => (
            <div
              key={skill}
              className="flex items-center justify-between text-base text-muted-foreground"
            >
              {skill}
              <span className="text-sm">In progress</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <Card key={label} className="items-center gap-2 p-4 text-center">
            <Icon className="size-5 text-primary" />
            <p className="text-lg font-semibold text-foreground">{value}</p>
            <p className="text-xs leading-tight text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>

      <Card className="flex-row items-center gap-3 p-4">
        <Briefcase className="size-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          {plan
            ? t('worker.modulesDone', { done: completedModules, total: modules.length })
            : t('common.loading')}
        </p>
      </Card>
    </main>
  );
}
