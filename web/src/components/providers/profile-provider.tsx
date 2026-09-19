'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { getMe, updateMe, type MeResponse, type UpdateMeBody } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

/**
 * The signed-in worker's own profile and settings, fetched once per mount of
 * the worker shell and shared by every screen under it.
 *
 * ## Why a provider rather than a hook per screen
 *
 * Five worker screens show the person's name, profession or skill level. Called
 * individually that is five identical `/api/me` round trips on every
 * navigation, all returning the same two items. The layout mounts once and the
 * screens below it re-render, so one fetch here serves all of them.
 *
 * ## What it is not
 *
 * Not an auth boundary and not a source of identity. `orgId`, `userId` and
 * `role` are resolved server-side from verified Cognito claims — by
 * `gatePage()` in the layout for the UX redirect, and independently by
 * `requireSession()` inside every route handler, which is the actual
 * enforcement. Nothing a screen reads from here is ever sent back as a claim
 * about who the caller is.
 */
interface ProfileContextValue extends MeResponse {
  loading: boolean;
  error: string | null;
  /** Optimistic local patch plus the PATCH itself; re-throws so callers can revert. */
  save: (patch: UpdateMeBody) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { data, error, loading } = useApi(() => getMe(), []);
  const [patched, setPatched] = useState<UpdateMeBody | null>(null);

  const save = useCallback(async (patch: UpdateMeBody) => {
    setPatched((prev) => ({ ...prev, ...patch }));
    try {
      await updateMe(patch);
    } catch (err) {
      setPatched(null); // drop the optimistic layer; next read shows the server's truth
      throw err;
    }
  }, []);

  const value = useMemo<ProfileContextValue>(() => {
    const profile = data?.profile ?? null;
    const settings = data?.settings ?? null;
    return {
      profile:
        profile && patched
          ? {
              ...profile,
              ...(patched.name !== undefined ? { name: patched.name } : {}),
              ...(patched.profession !== undefined ? { profession: patched.profession } : {}),
              ...(patched.skillLevel !== undefined ? { skillLevel: patched.skillLevel } : {}),
            }
          : profile,
      settings:
        settings && patched
          ? {
              ...settings,
              ...(patched.language !== undefined ? { language: patched.language } : {}),
              ...(patched.learningMode !== undefined ? { learningMode: patched.learningMode } : {}),
              ...(patched.accessibilityMode !== undefined
                ? { accessibilityMode: patched.accessibilityMode }
                : {}),
            }
          : settings,
      loading,
      error,
      save,
    };
  }, [data, patched, loading, error, save]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

/**
 * Read the shared profile.
 *
 * Throws outside the provider rather than returning a null-ish default: a
 * screen rendering a blank name because it sits outside the worker shell is a
 * bug that should be loud, not a cosmetic glitch discovered on stage.
 */
export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
