import { gatePage } from '@/lib/auth';
import { BottomNav } from '@/components/worker/bottom-nav';
import { WorkerTopNav } from '@/components/worker/worker-nav';
import { ProfileProvider } from '@/components/providers/profile-provider';
import { WorkerShell } from '@/components/worker/worker-shell';

export default async function WorkerLayout({ children }: LayoutProps<'/'>) {
  await gatePage('worker');
  return (
    <ProfileProvider>
      <WorkerShell>
        <div className="flex min-h-full flex-col bg-background">
          <WorkerTopNav />
          {/* pb-20 reserves space for the fixed BottomNav, which only exists
              below lg — on a laptop the nav is the top bar instead. */}
          <div className="flex-1 pb-20 lg:pb-8">{children}</div>
          <BottomNav />
        </div>
      </WorkerShell>
    </ProfileProvider>
  );
}
