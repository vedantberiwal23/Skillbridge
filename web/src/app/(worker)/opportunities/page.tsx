'use client';

import { CheckCircle2, Circle } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fixtureBadges, fixtureOpportunities, fixtureSkillProfile } from '@/lib/fixtures';

/**
 * Phase-3 screen per the product brief — kept intentionally minimal for now.
 * The full "browse all jobs, filter by location/pay" experience is future
 * work; what matters today is the core loop this brief calls out: show a
 * worker exactly which of their verified skills already qualify them, and
 * which are the gap.
 */
export default function OpportunitiesPage() {
  const verifiedSkills = [...fixtureSkillProfile.strengths, ...fixtureBadges.map((b) => b.title)];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-8 pb-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Opportunities</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Roles your verified skills already open up.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {fixtureOpportunities.map((opportunity) => {
          const matched = opportunity.requiredSkills.filter((s) => verifiedSkills.includes(s));
          const readiness = Math.round((matched.length / opportunity.requiredSkills.length) * 100);

          return (
            <Card key={opportunity.opportunityId} className="gap-3 p-5">
              <div>
                <p className="text-lg font-semibold text-foreground">{opportunity.title}</p>
                <p className="text-sm text-muted-foreground">
                  {opportunity.location} · {opportunity.payRange}
                </p>
              </div>
              <p className="text-sm font-medium text-primary">You&rsquo;re {readiness}% ready</p>
              <ul className="flex flex-col gap-1.5">
                {opportunity.requiredSkills.map((skill) => {
                  const has = verifiedSkills.includes(skill);
                  return (
                    <li key={skill} className="flex items-center gap-2 text-sm text-foreground">
                      {has ? (
                        <CheckCircle2 className="size-4 shrink-0 text-success" />
                      ) : (
                        <Circle className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      {skill}
                    </li>
                  );
                })}
              </ul>
              {readiness < 100 ? (
                <Button size="xl" className="mt-1 w-full">
                  Complete remaining skill
                </Button>
              ) : (
                <Button size="xl" variant="secondary" className="mt-1 w-full">
                  You qualify — apply
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
