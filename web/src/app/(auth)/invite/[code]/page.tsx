import { InviteRedeemView } from '@/components/auth/invite-redeem-view';

/**
 * Invite redemption entry point.
 *
 * Workers receive an employer invite with a code. This page resolves the code
 * and presents the account activation screen.
 *
 * Conforms to Next.js 16 async params and PageProps typegen helper.
 */
export default async function InvitePage({
  params,
}: PageProps<'/invite/[code]'>) {
  const { code } = await params;

  return <InviteRedeemView code={code} />;
}
