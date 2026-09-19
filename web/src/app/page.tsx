import { redirect } from 'next/navigation';

import { getSession, HOME_FOR_ROLE } from '@/lib/auth';

/**
 * The front door.
 *
 * A signed-in user never sees a marketing page: `/` resolves the session
 * server-side and sends them straight to their own home. Everyone else gets the
 * landing page at `/welcome`.
 *
 * This is strictly B2B, so `/welcome` sells to organizations and its only
 * action is sign-in. The real entries are `/login` and `/invite/[code]`; there
 * is no sign-up screen here or anywhere, and `selfSignUpEnabled` is false on the
 * user pool, so adding one would fail at runtime rather than merely be wrong.
 */
export default async function RootPage() {
  const session = await getSession();

  if (!session) redirect('/welcome');
  redirect(HOME_FOR_ROLE[session.role]);
}
