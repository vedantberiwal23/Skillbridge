import Link from 'next/link';

import { gatePage } from '@/lib/auth';

/**
 * The admin's landing screen — `HOME_FOR_ROLE.admin` points here, so it is the
 * first thing an admin sees after signing in.
 *
 * The user directory itself is not built. Listing an org's people is a GSI1
 * query (`gsi1.deptPrefix`), but no route exposes it, and adding one is not on
 * the demo spine. So this screen says that plainly instead of rendering an
 * empty table: a screen that has been cut should look cut, not broken. The one
 * admin action that IS on the spine — issuing an invite — is the primary action
 * here.
 */
export default async function AdminUsersPage() {
  // gatePage, not requireSession: this is a page, and requireSession THROWS on a
  // missing session, which fails static prerendering at build time. gatePage
  // redirects instead, which Next understands. The enforcement boundary is the
  // route handler either way.
  const session = await gatePage('admin');

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Organization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as admin &bull; {session.orgId}
        </p>
      </header>

      <Link
        href="/invites"
        className="mt-8 flex items-center justify-between rounded-xl border border-border bg-card px-6 py-5 transition hover:border-primary"
      >
        <span>
          <span className="block text-base font-semibold text-foreground">Invite a worker</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Issue a code for someone to join this organization
          </span>
        </span>
        <span aria-hidden className="text-muted-foreground">
          &rarr;
        </span>
      </Link>

      <section className="mt-6">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          User directory
        </h2>
        <p className="mt-3 rounded-xl border border-dashed border-border px-6 py-8 text-sm text-muted-foreground">
          Not in this build. The org directory, department assignment and billing
          screens are designed and modelled but were cut to keep the worker
          learning path complete.
        </p>
      </section>
    </main>
  );
}
