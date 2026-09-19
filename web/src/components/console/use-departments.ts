'use client';

import { useCallback, useState } from 'react';

import { getDepartments } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { Department } from '@/lib/types';

const SELECTED_KEY = 'sb.console.dept';

function readSelected(): string | null {
  try {
    return typeof window === 'undefined' ? null : localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

/**
 * The departments the signed-in manager or admin may work with, plus which one
 * is selected. The selection is remembered per device so the console reopens
 * on the department the person was last looking at.
 *
 * Which departments appear is decided server-side (`lib/scope.ts`); this only
 * chooses among them.
 */
export function useDepartments() {
  const [version, setVersion] = useState(0);
  const { data, error, loading } = useApi(() => getDepartments(), [version]);
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);

  const departments: Department[] = data?.departments ?? [];
  const selected = departments.find((d) => d.deptId === selectedId) ?? departments[0] ?? null;

  const select = useCallback((deptId: string) => {
    setSelectedId(deptId);
    try {
      localStorage.setItem(SELECTED_KEY, deptId);
    } catch {
      // Not remembered across visits; harmless.
    }
  }, []);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { departments, selected, select, loading: loading && !data, error, reload };
}
