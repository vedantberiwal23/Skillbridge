'use client';

import { useEffect, useState } from 'react';
import { ApiError } from './api-client';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Run one API call on mount and expose its three honest states.
 *
 * Screens here are read-mostly and short-lived, so this is deliberately not a
 * cache: no revalidation, no dedupe, no store. What it does provide is the
 * thing hand-rolled effects get wrong — a cancelled flag, so a response that
 * lands after the component unmounts (or after `deps` change) cannot call
 * setState on a dead component or overwrite newer data with older.
 *
 * `load` is intentionally not in the dependency list; callers pass inline
 * arrows, which are a new function every render and would loop forever. `deps`
 * is the real trigger — list the values the call is built from.
 */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    // No synchronous setState here: on the first run the initial state is
    // already `loading`, and on a deps change the flag is folded into whichever
    // result lands. Setting it up front costs an extra render pass per fetch
    // and, on a fast cached response, a visible flash of the loading state.
    load()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection.';
        setState({ data: null, error: message, loading: false });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
