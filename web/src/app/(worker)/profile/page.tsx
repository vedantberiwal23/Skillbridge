import { Award, BookOpen, Briefcase, TrendingUp } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { fixtureBadges, fixturePlan, fixtureProfile, fixtureSkillProfile } from '@/lib/fixtures';

/**
 * Phase-3 screen per the product brief — a thin "digital skill passport" for
 * now (identity + headline stats). The shareable/employer-facing view and
 * the full verified-skill ladder are future work; this establishes the data
 * this project already has (fixtureProfile, fixturePlan, fixtureBadges) in
 * the shape the brief describes, so later phases extend rather than replace it.
 */
export default function ProfilePage() {
  const completedModules = fixturePlan.modules.filter((m) => m.completedAt).length;

  const stats = [
    { icon: BookOpen, label: 'Courses completed', value: '1' },
    { icon: Award, label: 'Certificates', value: String(fixtureBadges.length) },
    { icon: TrendingUp, label: 'Skill level', value: fixtureProfile.skillLevel ?? '—' },
  ];

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 pt-8 pb-4">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-semibold text-primary">
          {fixtureProfile.name
            .split(' ')
            .map((n) => n[0])
            .join('')}
        </div>
        <div>
          <p className="text-xl font-semibold text-foreground">{fixtureProfile.name}</p>
          <p className="text-base text-muted-foreground">{fixtureProfile.profession}</p>
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
          {completedModules} of {fixturePlan.modules.length} lessons complete in{' '}
          {fixturePlan.profession}
        </p>
      </Card>
    </main>
  );
}
