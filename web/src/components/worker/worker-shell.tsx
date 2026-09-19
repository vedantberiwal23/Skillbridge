'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useProfile } from '@/components/providers/profile-provider';
import { TourProvider } from '@/components/tour/tour-provider';

/**
 * The client half of the worker shell: first-run routing and the product tour.
 *
 * A worker whose PROFILE has no trade yet has not been through onboarding —
 * invite redemption writes `profession: null` — so every worker screen sends
 * them there first. Without it, a new joiner lands on a home screen with no
 * name under the greeting and a plan that was never generated.
 *
 * A missing PROFILE is left alone: that is an account created outside invite
 * redemption, which onboarding cannot fix because PATCH /api/me refuses to
 * create the record.
 *
 * The tour auto-starts only once onboarding is done, so it never fires over a
 * screen the worker is about to be redirected away from.
 */
export function WorkerShell({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useProfile();
  const pathname = usePathname();
  const router = useRouter();

  const needsOnboarding = !loading && profile !== null && !profile.profession;
  const onOnboarding = pathname.startsWith('/onboarding');

  useEffect(() => {
    if (needsOnboarding && !onOnboarding) router.replace('/onboarding');
  }, [needsOnboarding, onOnboarding, router]);

  return (
    <TourProvider role="worker" autoStart={!loading && !needsOnboarding && !onOnboarding}>
      {children}
    </TourProvider>
  );
}
