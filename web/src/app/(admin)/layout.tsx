import { gatePage } from '@/lib/auth';
import { ConsoleShell } from '@/components/console/console-shell';
import { TourProvider } from '@/components/tour/tour-provider';

export default async function AdminLayout({ children }: LayoutProps<'/'>) {
  await gatePage('admin');
  return (
    <TourProvider role="admin">
      <ConsoleShell role="admin">{children}</ConsoleShell>
    </TourProvider>
  );
}
