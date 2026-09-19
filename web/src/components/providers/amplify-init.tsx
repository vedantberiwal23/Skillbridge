'use client';

import { configureAmplify } from '@/lib/amplify';

/**
 * Configure Amplify once, on every page load, before anything asks it for a token.
 *
 * It used to be configured only inside `login/page.tsx` and `console-shell.tsx`,
 * which is enough for a session that stays on the client router after signing in
 * and not otherwise. On a fresh load of a worker page — a refresh, a deep link, a
 * QR code, a PWA restore — Amplify was unconfigured, so `fetchAuthSession()` in
 * `voice/channel.ts` never settled. The channel sat at "Connecting…" forever: no
 * socket was ever opened, so the open-timeout that would have reported
 * "unavailable" never armed either. Silent, permanent, and invisible to every
 * check that does not involve reloading a worker page.
 *
 * At module scope rather than in an effect, so the call happens while the bundle
 * evaluates and a component that reads a token during its first render cannot
 * lose the race. `configureAmplify()` guards itself against running twice.
 */
configureAmplify();

export function AmplifyInit() {
  return null;
}
