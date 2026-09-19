'use client';

import Link from 'next/link';

/**
 * Worker chrome. Deliberately thin: one title, one optional way back.
 * Dashboard density belongs to manager and admin, not here.
 */
export function WorkerHeader({
  title,
  backHref,
  backLabel,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-4">
      {backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <svg
            className="size-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
      ) : null}
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
    </header>
  );
}
