import { gatePage } from '@/lib/auth';
import { BottomNav } from '@/components/worker/bottom-nav';
import { ProfileProvider } from '@/components/providers/profile-provider';

export default async function WorkerLayout({ children }: LayoutProps<'/'>) {
  await gatePage('worker');
  return (
    <ProfileProvider>
      <div className="flex min-h-full flex-col bg-background">
        {/* pb-20 reserves space for the fixed BottomNav so the last bit of
            content on every screen isn't hidden behind it. */}
        <div className="flex-1 pb-20">{children}</div>
        <BottomNav />
      </div>
    </ProfileProvider>
  );
}
