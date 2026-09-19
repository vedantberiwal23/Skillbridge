import { gatePage } from '@/lib/auth';

export default async function ManagerLayout({ children }: LayoutProps<'/'>) {
  await gatePage('manager');
  return children;
}
