'use client';

import { TeamManager } from '@/components/console/team-manager';
import { DeptSwitcher } from '@/components/console/dept-switcher';
import { useDepartments } from '@/components/console/use-departments';
import {
  ConsoleEmpty,
  ConsoleError,
  ConsoleHeader,
  ConsoleLoading,
  ConsolePage,
} from '@/components/console/console-page';

/** Manager: the people in their department(s), organised into groups. */
export default function ManagerTeamPage() {
  const { departments, selected, select, loading, error } = useDepartments();

  if (loading) return <ConsoleLoading />;
  if (error) return <ConsoleError message={error} />;
  if (!selected) {
    return (
      <ConsoleEmpty
        title="No department yet"
        body="Ask your organization admin to assign you to a department."
      />
    );
  }

  return (
    <ConsolePage>
      <ConsoleHeader
        title="Team & groups"
        description="Organise your people into crews, shifts or lines. Select people to add them to a group or move them."
        actions={<DeptSwitcher departments={departments} value={selected.deptId} onChange={select} />}
      />
      <TeamManager key={selected.deptId} dept={selected} departments={departments} />
    </ConsolePage>
  );
}
