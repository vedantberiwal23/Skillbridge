'use client';

import { useI18n } from '@/i18n/provider';
import { DepartmentDashboard } from '@/components/console/department-dashboard';
import { DeptSwitcher } from '@/components/console/dept-switcher';
import { useDepartments } from '@/components/console/use-departments';
import { ConsolePage, ConsoleEmpty, ConsoleError, ConsoleLoading } from '@/components/console/console-page';

/**
 * Manager home: the dashboard for whichever of their departments is selected.
 * A manager who runs more than one department switches between them here.
 */
export default function ManagerDashboardPage() {
  const { t } = useI18n();
  const { departments, selected, select, loading, error } = useDepartments();

  if (loading) return <ConsoleLoading />;
  if (error) return <ConsoleError message={error} />;
  if (!selected) {
    return (
      <ConsoleEmpty
        title="No department yet"
        body="Ask your organization admin to assign you to a department. It will appear here straight away."
      />
    );
  }

  return (
    <ConsolePage>
      <DepartmentDashboard
        key={selected.deptId}
        deptId={selected.deptId}
        gettingStarted
        rosterHref="/team"
        heading={
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {t('manager.dashboard')}
            </h1>
            <div className="mt-3">
              <DeptSwitcher departments={departments} value={selected.deptId} onChange={select} />
            </div>
          </>
        }
      />
    </ConsolePage>
  );
}
