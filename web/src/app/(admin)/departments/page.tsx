'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Pencil, Plus, Trash2, UserCog, Users } from 'lucide-react';
import { cn } from 'cn';

import {
  ApiError,
  createDepartment,
  deleteDepartment,
  getDirectory,
  updateDepartment,
} from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { Department, DirectoryEntry } from '@/lib/types';
import { useDepartments } from '@/components/console/use-departments';
import {
  btn,
  ConsoleError,
  ConsoleHeader,
  ConsoleLoading,
  ConsolePage,
  inputClass,
} from '@/components/console/console-page';

/**
 * Admin: the organization's departments.
 *
 * Create, rename, describe and delete departments, and choose who manages each.
 * A manager is anyone in the org with the manager role; the one invited into a
 * department runs it automatically, and more can be added here. People are
 * counted from one directory read, not per department.
 */
export default function AdminDepartmentsPage() {
  const { departments, loading, error, reload } = useDepartments();
  const [dirVersion, setDirVersion] = useState(0);
  const directory = useApi(() => getDirectory(), [dirVersion]);
  const [creating, setCreating] = useState(false);

  const people = useMemo(() => directory.data?.people ?? [], [directory.data]);
  const managers = people.filter((p) => p.role === 'manager');

  const byDept = useMemo(() => {
    const map = new Map<string, DirectoryEntry[]>();
    for (const p of people) {
      if (!p.deptId) continue;
      map.set(p.deptId, [...(map.get(p.deptId) ?? []), p]);
    }
    return map;
  }, [people]);

  const refresh = () => {
    reload();
    setDirVersion((v) => v + 1);
  };

  if (loading) return <ConsoleLoading />;
  if (error) return <ConsoleError message={error} />;

  return (
    <ConsolePage>
      <ConsoleHeader
        eyebrow="Organization"
        title="Departments"
        description="Split your plant the way it actually runs. Each department gets its own manager, groups and dashboard."
        actions={
          <button type="button" onClick={() => setCreating(true)} className={btn.primary} data-tour="dept-create">
            <Plus className="size-4" /> New department
          </button>
        }
      />

      {creating ? (
        <CreateDepartment
          onDone={() => {
            setCreating(false);
            refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {departments.length === 0 && !creating ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-base font-semibold text-foreground">No departments yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Create one for each part of the plant — Maintenance, Operations, Quality.
          </p>
          <button type="button" onClick={() => setCreating(true)} className={cn(btn.primary, 'mt-5')}>
            <Plus className="size-4" /> Create the first one
          </button>
        </div>
      ) : (
        <ul data-tour="dept-list" className="mt-6 grid gap-4 md:grid-cols-2">
          {departments.map((d) => (
            <DepartmentCard
              key={d.deptId}
              dept={d}
              members={byDept.get(d.deptId) ?? []}
              managers={managers}
              countsLoading={directory.loading && !directory.data}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
    </ConsolePage>
  );
}

function CreateDepartment({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createDepartment({ name: name.trim(), description: description.trim() || null });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the department.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground">New department</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Maintenance"
            maxLength={60}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">What it does (optional)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Hydraulics and electrical upkeep, Unit 2"
            maxLength={200}
            className={inputClass}
          />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy || !name.trim()} className={btn.primary}>
          {busy ? 'Creating…' : 'Create department'}
        </button>
        <button type="button" onClick={onCancel} className={btn.ghost}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DepartmentCard({
  dept,
  members,
  managers,
  countsLoading,
  onChanged,
}: {
  dept: Department;
  members: DirectoryEntry[];
  managers: DirectoryEntry[];
  countsLoading: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workers = members.filter((m) => m.role === 'worker');
  // Who runs it: anyone invited into it as a manager, plus any added by an admin.
  const runBy = managers.filter(
    (m) => m.deptId === dept.deptId || (dept.managerIds ?? []).includes(m.userId)
  );

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteDepartment(dept.deptId);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the department.');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li className="rounded-2xl border border-foreground/20 bg-card p-5">
        <EditDepartment
          dept={dept}
          managers={managers}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{dept.name}</p>
          {dept.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{dept.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${dept.name}`}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${dept.name}`}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-danger-muted hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" /> Workers
          </dt>
          <dd className="mt-0.5 font-data text-lg font-semibold text-foreground">
            {countsLoading ? '…' : workers.length}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserCog className="size-3.5" /> Managed by
          </dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
            {countsLoading ? '…' : runBy.length ? runBy.map((m) => m.name.split(' ')[0]).join(', ') : (
              <span className="text-danger">No manager yet</span>
            )}
          </dd>
        </div>
      </dl>

      {confirmDelete ? (
        <div className="mt-4 rounded-xl border border-border p-3 text-sm">
          <p className="text-foreground">
            {members.length > 0
              ? `${members.length} ${members.length === 1 ? 'person is' : 'people are'} still in ${dept.name}. Move them first.`
              : `Delete ${dept.name} and its groups?`}
          </p>
          <div className="mt-2 flex gap-2">
            {members.length === 0 ? (
              <button type="button" onClick={onDelete} disabled={busy} className={btn.danger}>
                Delete
              </button>
            ) : null}
            <button type="button" onClick={() => setConfirmDelete(false)} className={btn.ghost}>
              {members.length === 0 ? 'Keep' : 'OK'}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Link
        href={`/departments/${dept.deptId}`}
        className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-primary hover:underline"
      >
        People & groups <ArrowRight className="size-4" />
      </Link>
    </li>
  );
}

function EditDepartment({
  dept,
  managers,
  onDone,
  onCancel,
}: {
  dept: Department;
  managers: DirectoryEntry[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(dept.name);
  const [description, setDescription] = useState(dept.description ?? '');
  const [managerIds, setManagerIds] = useState<string[]>(dept.managerIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invited into this department as its manager: always runs it, not removable here.
  const home = new Set(managers.filter((m) => m.deptId === dept.deptId).map((m) => m.userId));

  const toggle = (id: string) =>
    setManagerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateDepartment({
        deptId: dept.deptId,
        name: name.trim(),
        description: description.trim() || null,
        managerIds: managerIds.filter((id) => !home.has(id)),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Description</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          className={inputClass}
        />
      </label>
      <fieldset>
        <legend className="text-xs font-medium text-muted-foreground">Managers</legend>
        {managers.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            No managers in the organization yet.{' '}
            <Link href="/invites" className="font-medium text-primary hover:underline">
              Invite one
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-1.5 flex max-h-44 flex-col gap-1 overflow-y-auto">
            {managers.map((m) => {
              const isHome = home.has(m.userId);
              const checked = isHome || managerIds.includes(m.userId);
              return (
                <li key={m.userId}>
                  <label
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm',
                      isHome ? 'text-muted-foreground' : 'cursor-pointer hover:bg-muted'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isHome}
                      onChange={() => toggle(m.userId)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className="truncate text-foreground">{m.name}</span>
                    {isHome ? <span className="ml-auto text-xs">joined here</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !name.trim()} className={btn.primary}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className={btn.ghost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
