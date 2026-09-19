'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Viewport check that gates *mounting*, not just visibility.
 *
 * Tailwind's `hidden md:block` only sets display:none — a hidden canvas or
 * Framer Motion tree still mounts and still burns main-thread time every frame.
 * On the low-end Android this product targets, that is real battery for
 * something nobody can see.
 *
 * Reads through useSyncExternalStore with a `false` server snapshot, so the
 * heavy subtree is never in the SSR output and there is no hydration mismatch.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;

  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    useCallback(() => window.matchMedia(query).matches, [query]),
    () => false
  );
}
