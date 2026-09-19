'use client';

import Link from 'next/link';
import { ArrowRight, Building2, Mail, UserCog, Users } from 'lucide-react';

import { getDirectory } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import { DepartmentDashboard } from '@/components/console/department-dashboard';
import { DeptSwitcher } from '@/components/console/dept-switcher';
import { useDepartments } from '@/components/console/use-departments';
import { btn, ConsoleError, ConsoleLoading, ConsolePage } from '@/components/console/console-page';

/**
 * Admin home: the organization in four numbers, then any department's
 * dashboard. The org numbers come from one directory read; per-department
 * numbers stay on the materialized aggregate.
 */
export default function AdminOverviewPage() {
  const { departments, selected, select, loading, error } = useDepartments();
  const directory = useApi(() => getDirectory(), []);

  if (loading) return <ConsoleLoading />;
  if (error) return <ConsoleError message={error} />;

  const people = directory.data?.people ?? [];
  const workers = people.filter((p) => p.role === 'worker');
  const managers = people.filter((p) => p.role === 'manager');
  const unassigned = people.filter((p) => !p.deptId && p.role !== 'admin');
  const notSetUp = workers.filter((p) => !p.profession);

  return (
    <ConsolePage>
      <p className="font-data text-xs uppercase tracking-[0.14em] text-muted-foreground">Organization</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Overview</h1>

      <dl data-tour="org-stats" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OrgStat icon={Building2} label="Departments" value={departments.length} href="/departments" />
        <OrgStat
          icon={Users}
          label="Workers"
          value={directory.loading ? '…' : workers.length}
          hint={notSetUp.length ? `${notSetUp.length} not set up yet` : undefined}
          href="/users"
        />
        <OrgStat icon={UserCog} label="Managers" value={directory.loading ? '…' : managers.length} href="/users" />
        <OrgStat
          icon={Users}
          label="Not in a department"
          value={directory.loading ? '…' : unassigned.length}
          tone={unassigned.length > 0 ? 'warning' : undefined}
          href="/users"
        />
      </dl>

      {departments.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-base font-semibold text-foreground">Start by creating your departments</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Maintenance, Operations, Quality — whatever your plant is split into. Then invite a manager to each.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/departments" className={btn.primary}>
              Create departments <ArrowRight className="size-4" />
            </Link>
            <Link href="/invites" className={btn.secondary}>
              <Mail className="size-4" /> Send invites
            </Link>
          </div>
        </div>
      ) : selected ? (
        <div className="mt-10 border-t border-border pt-8">
          <DepartmentDashboard
            key={selected.deptId}
            deptId={selected.deptId}
            rosterHref={`/departments/${selected.deptId}`}
            heading={
              <>
                <p className="font-data text-xs uppercase tracking-[0.14em] text-muted-foreground">Department</p>
                <div className="mt-2">
                  <DeptSwitcher departments={departments} value={selected.deptId} onChange={select} />
                </div>
              </>
            }
          />
        </div>
      ) : null}
      {directory.error ? <p className="mt-4 text-sm text-danger">{directory.error}</p> : null}
    </ConsolePage>
  );
}

function OrgStat({
  icon: Icon,
  label,
  value,
  hint,
  href,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  href: string;
  tone?: 'warning';
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:p-5"
    >
      <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className={`mt-2 font-data text-3xl font-semibold tracking-tight ${tone === 'warning' ? 'text-warning' : 'text-foreground'}`}>
        {value}
      </dd>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Link>
  );
}
