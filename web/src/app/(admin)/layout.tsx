import { gatePage } from '@/lib/auth';

export default async function AdminLayout({ children }: LayoutProps<'/'>) {
  await gatePage('admin');
  return children;
}
