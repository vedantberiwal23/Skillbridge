'use client';

import { Building2, ChevronDown } from 'lucide-react';

import type { Department } from '@/lib/types';

/**
 * Picks which department the console is showing. A native select on purpose:
 * it is keyboard- and screen-reader-correct for free and gives phones their own
 * picker. With a single department there is nothing to choose, so it renders
 * as a label.
 */
export function DeptSwitcher({
  departments,
  value,
  onChange,
}: {
  departments: Department[];
  value: string | null;
  onChange: (deptId: string) => void;
}) {
  const current = departments.find((d) => d.deptId === value);

  if (departments.length <= 1) {
    return (
      <span
        data-tour="dept-switcher"
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground"
      >
        <Building2 className="size-4 text-muted-foreground" />
        {current?.name ?? 'No department'}
      </span>
    );
  }

  return (
    <label
      data-tour="dept-switcher"
      className="relative inline-flex items-center rounded-xl border border-border bg-card focus-within:border-primary"
    >
      <Building2 className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
      <span className="sr-only">Department</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent py-2 pl-9 pr-9 text-sm font-medium text-foreground outline-none"
      >
        {departments.map((d) => (
          <option key={d.deptId} value={d.deptId}>
            {d.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />
    </label>
  );
}
