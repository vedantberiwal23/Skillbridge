'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { TeamManager } from '@/components/console/team-manager';
import { useDepartments } from '@/components/console/use-departments';
import {
  ConsoleEmpty,
  ConsoleError,
  ConsoleHeader,
  ConsoleLoading,
  ConsolePage,
} from '@/components/console/console-page';

/** Admin: one department's people and groups — the same tool a manager uses. */
export default function AdminDepartmentTeamPage() {
  const { deptId } = useParams<{ deptId: string }>();
  const { departments, loading, error } = useDepartments();

  if (loading) return <ConsoleLoading />;
  if (error) return <ConsoleError message={error} />;

  const dept = departments.find((d) => d.deptId === deptId);
  if (!dept) {
    return (
      <ConsoleEmpty
        title="Department not found"
        body="It may have been deleted."
        action={
          <Link href="/departments" className="text-sm font-semibold text-primary hover:underline">
            Back to departments
          </Link>
        }
      />
    );
  }

  return (
    <ConsolePage>
      <Link
        href="/departments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Departments
      </Link>
      <div className="mt-3">
        <ConsoleHeader
          title={dept.name}
          description={dept.description ?? 'People and working groups in this department.'}
        />
      </div>
      <TeamManager key={dept.deptId} dept={dept} departments={departments} />
    </ConsolePage>
  );
}
