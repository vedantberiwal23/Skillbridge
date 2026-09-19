'use client';

import Link from 'next/link';
import { ArrowRight, Building2, Mail, UserCog, Users } from 'lucide-react';

import { getDeptAggregate, getDirectory } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import { DepartmentDashboard } from '@/components/console/department-dashboard';
import { DeptSwitcher } from '@/components/console/dept-switcher';
import { useDepartments } from '@/components/console/use-departments';
import { btn, ConsoleError, ConsoleLoading, ConsolePage, Panel } from '@/components/console/console-page';
import { Ring } from '@/components/console/ring';

/**
 * Admin home: the organization in four numbers, then any department's
 * dashboard. The org numbers come from one directory read; per-department
 * numbers stay on the materialized aggregate.
 */
export default function AdminOverviewPage() {
  const { departments, selected, select, loading, error } = useDepartments();
  const directory = useApi(() => getDirectory(), []);
  const deptKey = departments.map((d) => d.deptId).join(',');
  // One GetItem per department on the materialized aggregate — bounded by the
  // number of departments, never by the number of workers.
  const reports = useApi(
    () => Promise.all(departments.map((d) => getDeptAggregate(d.deptId).then((r) => r.aggregate))),
    [deptKey]
  );

  if (loading) return <ConsoleLoading />;
  if (error) return <ConsoleError message={error} />;

  const people = directory.data?.people ?? [];
  const workers = people.filter((p) => p.role === 'worker');
  const managers = people.filter((p) => p.role === 'manager');
  const unassigned = people.filter((p) => !p.deptId && p.role !== 'admin');
  const notSetUp = workers.filter((p) => !p.profession);
  const placeable = people.filter((p) => p.role !== 'admin');
  const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));
  const staffed = departments.filter((d) =>
    managers.some((m) => m.deptId === d.deptId || (d.managerIds ?? []).includes(m.userId))
  ).length;
  const ready = !directory.loading || Boolean(directory.data);

  return (
    <ConsolePage>
      <p className="font-data text-xs uppercase tracking-[0.14em] text-muted-foreground">Organization</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Overview</h1>

      <dl data-tour="org-stats" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OrgStat icon={Building2} label="Departments" value={departments.length} href="/departments" />
        <OrgStat icon={Users} label="Workers" value={ready ? workers.length : '…'} href="/users" />
        <OrgStat icon={UserCog} label="Managers" value={ready ? managers.length : '…'} href="/users" />
        <OrgStat icon={Users} label="Not in a department" value={ready ? unassigned.length : '…'} href="/users" />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Organization report" description="How complete your setup is.">
          <div className="flex flex-col gap-5">
            <Ring
              value={ready ? pct(workers.length - notSetUp.length, workers.length) : null}
              label="Workers onboarded"
              sublabel={`${workers.length - notSetUp.length} of ${workers.length} picked a trade`}
            />
            <Ring
              value={ready ? pct(placeable.length - unassigned.length, placeable.length) : null}
              label="Placed in a department"
              sublabel={`${unassigned.length} still unassigned`}
              alert={(pct(placeable.length - unassigned.length, placeable.length) ?? 100) < 75}
            />
            <Ring
              value={ready ? pct(staffed, departments.length) : null}
              label="Departments with a manager"
              sublabel={`${staffed} of ${departments.length}`}
              alert={(pct(staffed, departments.length) ?? 100) < 75}
            />
          </div>
        </Panel>

        <Panel title="Department performance" description="Assessment pass rate this month.">
          {departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No departments yet.</p>
          ) : (
            <ul className="-my-2 divide-y divide-border">
              {departments.map((d, i) => {
                const agg = reports.data?.[i];
                const attempted = agg ? agg.assessmentsPassed + agg.assessmentsFailed : 0;
                const rate = agg && attempted > 0 ? Math.round((agg.assessmentsPassed / attempted) * 100) : null;
                const gap = agg ? Object.entries(agg.skillGaps).sort((a, b) => b[1] - a[1])[0] : undefined;
                return (
                  <li key={d.deptId}>
                    <button
                      type="button"
                      onClick={() => select(d.deptId)}
                      className="flex w-full items-center gap-4 py-3 text-left"
                    >
                      <Ring value={rate} size={48} stroke={5} alert={rate !== null && rate < 75} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{d.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {agg ? `${agg.workerCount} workers · ${attempted} assessments` : 'Loading…'}
                        </span>
                      </span>
                      <span className="hidden max-w-[40%] text-right text-xs text-muted-foreground sm:block">
                        {gap ? (
                          <>
                            Weakest: <span className="text-foreground">{gap[0]}</span> ({gap[1]}%)
                          </>
                        ) : (
                          'No gaps recorded'
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

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
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 sm:p-5">
      <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="mt-2 font-data text-3xl font-semibold tracking-tight text-foreground">{value}</dd>
    </Link>
  );
}
