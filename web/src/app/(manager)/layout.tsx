import { gatePage } from '@/lib/auth';
import { ConsoleShell } from '@/components/console/console-shell';
import { TourProvider } from '@/components/tour/tour-provider';

export default async function ManagerLayout({ children }: LayoutProps<'/'>) {
  await gatePage('manager');
  return (
    <TourProvider role="manager">
      <ConsoleShell role="manager">{children}</ConsoleShell>
    </TourProvider>
  );
}
