'use client';

import { notFound } from 'next/navigation';
import { DEMO_ENABLED, DEMO_PERSONAS, type DemoPersona } from '@/lib/demo';

/**
 * Switching persona is a full page load, not React state, so it lives at module
 * scope: the browser globals it writes are outside React's ownership and the
 * compiler's immutability rule rejects touching them from a component body.
 */
function enter(persona: DemoPersona) {
  document.cookie = `demo_role=${persona}; path=/; max-age=86400`;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('sb.')) localStorage.removeItem(k);
  } catch {}
  window.location.assign(persona === 'worker-new' ? '/onboarding' : '/');
}

/** Local demo entry: pick who to be. 404s unless demo mode is on. */
export default function DemoPage() {
  if (!DEMO_ENABLED) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <p className="font-data text-xs uppercase tracking-[0.14em] text-primary">Local demo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Who do you want to be?</h1>
      <p className="mt-2 text-sm text-muted-foreground">No login, sample data, nothing is saved.</p>
      <div className="mt-8 flex flex-col gap-3">
        {(Object.keys(DEMO_PERSONAS) as DemoPersona[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => enter(k)}
            className="rounded-2xl border border-border bg-card px-5 py-4 text-left text-base font-semibold text-foreground transition-colors hover:border-primary"
          >
            {DEMO_PERSONAS[k].label}
          </button>
        ))}
      </div>
    </main>
  );
}
