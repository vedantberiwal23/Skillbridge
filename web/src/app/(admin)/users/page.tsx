'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Mail, Search } from 'lucide-react';
import { cn } from 'cn';

import { ApiError, getDirectory, moveMember } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { DirectoryEntry, Role } from '@/lib/types';
import { useDepartments } from '@/components/console/use-departments';
import { Avatar, StatusPill, titleCase } from '@/components/console/department-dashboard';
import { btn, ConsoleHeader, ConsolePage } from '@/components/console/console-page';

const ROLE_LABEL: Record<Role, string> = { worker: 'Worker', manager: 'Manager', admin: 'Admin' };

/**
 * Admin: everyone in the organization, with their department.
 *
 * One directory read. Placing someone in a department (or moving them) is a
 * single PATCH that updates their profile, its directory key and their groups
 * together — see PATCH /api/team.
 */
export default function AdminPeoplePage() {
  const [version, setVersion] = useState(0);
  const directory = useApi(() => getDirectory(), [version]);
  const { departments } = useDepartments();

  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'all' | Role>('all');
  const [dept, setDept] = useState<'all' | 'none' | string>('all');
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const people = useMemo(() => directory.data?.people ?? [], [directory.data]);
  const deptName = useMemo(() => new Map(departments.map((d) => [d.deptId, d.name])), [departments]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (role !== 'all' && p.role !== role) return false;
      if (dept === 'none' && p.deptId) return false;
      if (dept !== 'all' && dept !== 'none' && p.deptId !== dept) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.profession ?? '').toLowerCase().includes(q);
    });
  }, [people, query, role, dept]);

  const counts = useMemo(
    () => ({
      all: people.length,
      worker: people.filter((p) => p.role === 'worker').length,
      manager: people.filter((p) => p.role === 'manager').length,
      admin: people.filter((p) => p.role === 'admin').length,
    }),
    [people]
  );

  const move = async (person: DirectoryEntry, deptId: string) => {
    setPending(person.userId);
    setStatus(null);
    try {
      await moveMember(person.userId, deptId);
      setStatus({ tone: 'ok', text: `${person.name} moved to ${deptName.get(deptId) ?? deptId}` });
      setVersion((v) => v + 1);
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not move them.' });
    } finally {
      setPending(null);
    }
  };

  return (
    <ConsolePage>
      <ConsoleHeader
        eyebrow="Organization"
        title="People"
        description="Everyone who has joined, and which department they belong to."
        actions={
          <Link href="/invites" className={btn.primary} data-tour="invite-cta">
            <Mail className="size-4" /> Invite people
          </Link>
        }
      />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 text-sm">
          {(['all', 'worker', 'manager', 'admin'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={cn(
                'rounded-lg px-3 py-1.5 transition-colors',
                role === r ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r === 'all' ? 'Everyone' : `${ROLE_LABEL[r]}s`}{' '}
              <span className="font-data text-xs opacity-70">{counts[r]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            aria-label="Filter by department"
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="all">All departments</option>
            <option value="none">Not in a department</option>
            {departments.map((d) => (
              <option key={d.deptId} value={d.deptId}>
                {d.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:border-primary">
            <Search className="size-3.5 text-muted-foreground" />
            <span className="sr-only">Search people</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or trade"
              className="h-9 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground sm:w-52"
            />
          </label>
        </div>
      </div>

      {status ? (
        <p
          role="status"
          className={cn(
            'mt-4 rounded-xl px-4 py-2.5 text-sm',
            status.tone === 'ok' ? 'border border-border text-foreground' : 'border border-danger/30 text-danger'
          )}
        >
          {status.text}
        </p>
      ) : null}

      <section data-tour="people-table" className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
        {directory.error ? (
          <p className="p-5 text-sm text-danger">{directory.error}</p>
        ) : directory.loading && !directory.data ? (
          <div className="flex flex-col gap-2 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {people.length === 0 ? 'No one has joined yet. Send your first invites.' : 'No one matches these filters.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((p) => (
              <li key={p.userId} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={p.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {p.name || 'Unnamed'}
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {ROLE_LABEL[p.role] ?? p.role}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.role === 'worker'
                        ? `${p.profession ? titleCase(p.profession) : 'Trade not chosen yet'}${p.skillLevel ? ` · ${p.skillLevel}` : ''}`
                        : p.role === 'manager'
                          ? 'Runs their department'
                          : 'Organization admin'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-12 sm:pl-0">
                  {p.role === 'worker' ? <StatusPill active={Boolean(p.profession)} /> : null}
                  {p.role === 'admin' ? (
                    <span className="text-xs text-muted-foreground">Whole organization</span>
                  ) : (
                    <select
                      value={p.deptId ?? ''}
                      disabled={pending === p.userId || departments.length === 0}
                      onChange={(e) => e.target.value && move(p, e.target.value)}
                      aria-label={`Department for ${p.name}`}
                      className={cn(
                        'h-8 max-w-48 rounded-lg border bg-card px-2 text-sm outline-none focus:border-primary disabled:opacity-60',
                        p.deptId ? 'border-border text-foreground' : 'border-danger/40 text-danger'
                      )}
                    >
                      {!p.deptId ? <option value="">Choose department…</option> : null}
                      {p.deptId && !deptName.has(p.deptId) ? <option value={p.deptId}>{p.deptId}</option> : null}
                      {departments.map((d) => (
                        <option key={d.deptId} value={d.deptId}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {directory.data?.truncated ? (
        <p className="mt-2 text-xs text-muted-foreground">Showing the first 2,000 people.</p>
      ) : null}
    </ConsolePage>
  );
}
