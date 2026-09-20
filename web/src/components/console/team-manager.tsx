'use client';

import { useMemo, useState } from 'react';
import { Check, FolderPlus, Loader2, Pencil, Search, Trash2, UsersRound, X } from 'lucide-react';
import { cn } from 'cn';

import {
  ApiError,
  createGroup,
  deleteGroup,
  getGroups,
  getTeam,
  moveMember,
  updateGroup,
} from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { Department, TeamMember, WorkGroup } from '@/lib/types';
import { Avatar, StatusPill, titleCase } from './department-dashboard';
import { btn, inputClass } from './console-page';

type View = { kind: 'all' } | { kind: 'ungrouped' } | { kind: 'group'; groupId: string };

/**
 * People and working groups for one department.
 *
 * Groups are how a department is actually run — crews, shifts, production
 * lines. A manager selects people and adds them to a group, or moves them to
 * another department they run. Everything here is enforced again server-side:
 * the department must be in the caller's scope and every group member must be
 * in that department.
 */
export function TeamManager({
  dept,
  departments,
}: {
  dept: Department;
  /** Departments the caller may move people into. */
  departments: Department[];
}) {
  const deptId = dept.deptId;
  const [version, setVersion] = useState(0);
  const team = useApi(() => getTeam(deptId), [deptId, version]);
  const groupsRes = useApi(() => getGroups(deptId), [deptId, version]);

  const [view, setView] = useState<View>({ kind: 'all' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const members = useMemo(() => team.data?.members ?? [], [team.data]);
  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

  // A group's stored member list can name someone who has since moved out of
  // the department; show only people who are actually here.
  const groups: WorkGroup[] = useMemo(
    () =>
      (groupsRes.data?.groups ?? []).map((g) => ({
        ...g,
        memberIds: g.memberIds.filter((id) => memberIds.has(id)),
      })),
    [groupsRes.data, memberIds]
  );

  const groupsOf = useMemo(() => {
    const map = new Map<string, WorkGroup[]>();
    for (const g of groups) {
      for (const id of g.memberIds) map.set(id, [...(map.get(id) ?? []), g]);
    }
    return map;
  }, [groups]);

  const activeGroup = view.kind === 'group' ? groups.find((g) => g.groupId === view.groupId) ?? null : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (view.kind === 'ungrouped' && groupsOf.has(m.userId)) return false;
      if (view.kind === 'group' && !activeGroup?.memberIds.includes(m.userId)) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || (m.profession ?? '').toLowerCase().includes(q);
    });
  }, [members, query, view, groupsOf, activeGroup]);

  const ungroupedCount = members.filter((m) => !groupsOf.has(m.userId)).length;
  const otherDepts = departments.filter((d) => d.deptId !== deptId);

  const refresh = () => setVersion((v) => v + 1);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus({ tone: 'ok', text: label });
      refresh();
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.userId));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((m) => next.delete(m.userId));
      else visible.forEach((m) => next.add(m.userId));
      return next;
    });

  const chosen = [...selected].filter((id) => memberIds.has(id));

  const onCreate = () => {
    const name = newName.trim();
    if (!name) return;
    void run(`Created “${name}”`, async () => {
      const { group } = await createGroup({ deptId, name, memberIds: chosen });
      setCreating(false);
      setNewName('');
      setSelected(new Set());
      setView({ kind: 'group', groupId: group.groupId });
    });
  };

  const addToGroup = (groupId: string) => {
    const group = groups.find((g) => g.groupId === groupId);
    if (!group || chosen.length === 0) return;
    void run(`Added ${chosen.length} to “${group.name}”`, async () => {
      await updateGroup({ deptId, groupId, memberIds: [...new Set([...group.memberIds, ...chosen])] });
      setSelected(new Set());
    });
  };

  const removeFromGroup = () => {
    if (!activeGroup || chosen.length === 0) return;
    void run(`Removed ${chosen.length} from “${activeGroup.name}”`, async () => {
      await updateGroup({
        deptId,
        groupId: activeGroup.groupId,
        memberIds: activeGroup.memberIds.filter((id) => !chosen.includes(id)),
      });
      setSelected(new Set());
    });
  };

  const moveTo = (targetId: string) => {
    const target = departments.find((d) => d.deptId === targetId);
    if (!target || chosen.length === 0) return;
    void run(`Moved ${chosen.length} to ${target.name}`, async () => {
      for (const id of chosen) await moveMember(id, targetId);
      setSelected(new Set());
    });
  };

  const onRename = (groupId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void run('Group renamed', async () => {
      await updateGroup({ deptId, groupId, name: trimmed });
      setRenaming(null);
    });
  };

  const onDelete = () => {
    if (!activeGroup) return;
    void run(`Deleted “${activeGroup.name}”`, async () => {
      await deleteGroup(deptId, activeGroup.groupId);
      setConfirmDelete(false);
      setView({ kind: 'all' });
    });
  };

  const loading = (team.loading && !team.data) || (groupsRes.loading && !groupsRes.data);
  const loadError = team.error ?? groupsRes.error;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[250px_1fr]">
      {/* ── groups rail ── */}
      <nav data-tour="groups-rail" aria-label="Groups" className="flex flex-col gap-1 self-start rounded-2xl border border-border bg-card p-2">
        <RailItem
          active={view.kind === 'all'}
          onClick={() => setView({ kind: 'all' })}
          label="All people"
          count={members.length}
        />
        <RailItem
          active={view.kind === 'ungrouped'}
          onClick={() => setView({ kind: 'ungrouped' })}
          label="Not in a group"
          count={ungroupedCount}
          muted
        />
        <div className="mx-2 mt-3 flex items-center justify-between pb-1">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Groups</span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="New group"
            data-tour="new-group"
          >
            <FolderPlus className="size-4" />
          </button>
        </div>
        {creating ? (
          <form
            className="flex flex-col gap-2 rounded-xl bg-muted/60 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              onCreate();
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Night shift, Press line 2"
              className={inputClass}
              maxLength={60}
            />
            {chosen.length > 0 ? (
              <p className="px-1 text-xs text-muted-foreground">Starts with the {chosen.length} selected.</p>
            ) : null}
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !newName.trim()} className={cn(btn.primary, "flex-1")}>
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName('');
                }}
                className={btn.ghost}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        {groups.length === 0 && !creating && !loading ? (
          <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            No groups yet. Make one for each crew, shift or line.
          </p>
        ) : null}
        {groups.map((g) =>
          renaming === g.groupId ? (
            <RenameField key={g.groupId} initial={g.name} onSave={(name) => onRename(g.groupId, name)} onCancel={() => setRenaming(null)} busy={busy} />
          ) : (
            <RailItem
              key={g.groupId}
              active={view.kind === 'group' && view.groupId === g.groupId}
              onClick={() => {
                setView({ kind: 'group', groupId: g.groupId });
                setConfirmDelete(false);
              }}
              label={g.name}
              count={g.memberIds.length}
            />
          )
        )}
      </nav>

      {/* ── people ── */}
      <section aria-labelledby="people-title" className="min-w-0 rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 id="people-title" className="truncate text-base font-semibold text-foreground">
              {view.kind === 'all' ? 'All people' : view.kind === 'ungrouped' ? 'Not in a group' : activeGroup?.name ?? 'Group'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {visible.length} {visible.length === 1 ? 'person' : 'people'} · {dept.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeGroup ? (
              confirmDelete ? (
                <>
                  <span className="text-xs text-muted-foreground">Delete this group? People stay in the department.</span>
                  <button type="button" onClick={onDelete} disabled={busy} className={btn.danger}>
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={btn.ghost}>
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setRenaming(activeGroup.groupId)} className={btn.ghost}>
                    <Pencil className="size-3.5" /> Rename
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(true)} className={btn.danger}>
                    <Trash2 className="size-3.5" /> Delete
                  </button>
                </>
              )
            ) : null}
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 focus-within:border-primary">
              <Search className="size-3.5 text-muted-foreground" />
              <span className="sr-only">Search people</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground sm:w-40"
              />
            </label>
          </div>
        </div>

        {/* bulk bar */}
        <div
          data-tour="bulk-actions"
          className={cn(
            'flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-sm',
            chosen.length > 0 ? 'bg-muted/60' : 'bg-card'
          )}
        >
          <label className="flex items-center gap-2 pr-2">
            <Checkbox checked={allVisibleSelected} onChange={toggleAll} label="Select all shown" />
            <span className="text-muted-foreground">{chosen.length > 0 ? `${chosen.length} selected` : 'Select people to act on them'}</span>
          </label>
          {chosen.length > 0 ? (
            <>
              {view.kind === 'group' ? (
                <button type="button" onClick={removeFromGroup} disabled={busy} className={btn.secondary}>
                  <X className="size-3.5" /> Remove from group
                </button>
              ) : (
                <ActionSelect
                  label="Add to group"
                  disabled={busy || groups.length === 0}
                  options={groups.map((g) => ({ value: g.groupId, label: g.name }))}
                  onPick={addToGroup}
                />
              )}
              {otherDepts.length > 0 ? (
                <ActionSelect
                  label="Move to department"
                  disabled={busy}
                  options={otherDepts.map((d) => ({ value: d.deptId, label: d.name }))}
                  onPick={moveTo}
                />
              ) : null}
              <button type="button" onClick={() => setSelected(new Set())} className={btn.ghost}>
                Clear
              </button>
            </>
          ) : null}
          {busy ? <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" /> : null}
        </div>

        <p aria-live="polite" className="sr-only">
          {status?.text}
        </p>
        {status ? (
          <p
            className={cn(
              'flex items-center gap-2 border-b border-border px-4 py-2 text-sm',
              status.tone === 'ok' ? 'text-foreground' : 'text-danger'
            )}
          >
            {status.tone === 'ok' ? <Check className="size-4" /> : null}
            {status.text}
          </p>
        ) : null}

        {loadError ? (
          <p className="p-4 text-sm text-danger">{loadError}</p>
        ) : loading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyPeople view={view} hasMembers={members.length > 0} />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((m) => (
              <PersonRow
                key={m.userId}
                member={m}
                groups={groupsOf.get(m.userId) ?? []}
                checked={selected.has(m.userId)}
                onToggle={() => toggle(m.userId)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RailItem({
  active,
  onClick,
  label,
  count,
  muted,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-secondary font-semibold text-secondary-foreground' : 'hover:bg-muted',
        !active && (muted ? 'text-muted-foreground' : 'text-foreground')
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {!muted && label !== 'All people' ? <UsersRound className="size-3.5 shrink-0 opacity-60" /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-data text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function RenameField({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex items-center gap-1 rounded-lg bg-muted/60 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        maxLength={60}
        className={inputClass}
        aria-label="Group name"
      />
      <button type="submit" disabled={busy} aria-label="Save name" className="flex size-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-card">
        <Check className="size-4" />
      </button>
    </form>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="size-4 shrink-0 cursor-pointer rounded accent-[var(--primary)]"
    />
  );
}

/** A select that acts as a one-shot menu: picking an option runs it and resets. */
function ActionSelect({
  label,
  options,
  onPick,
  disabled,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
      aria-label={label}
      className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none focus:border-primary disabled:opacity-50"
    >
      <option value="">{label}…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function PersonRow({
  member,
  groups,
  checked,
  onToggle,
}: {
  member: TeamMember;
  groups: WorkGroup[];
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={cn('flex items-center gap-3 px-4 py-3 transition-colors', checked && 'bg-muted/50')}>
      <Checkbox checked={checked} onChange={onToggle} label={`Select ${member.name}`} />
      <Avatar name={member.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{member.name || 'Unnamed worker'}</p>
        <p className="truncate text-xs text-muted-foreground">
          {member.profession ? titleCase(member.profession) : 'Trade not chosen yet'}
          {member.skillLevel ? ` · ${member.skillLevel}` : ''}
        </p>
      </div>
      <div className="hidden max-w-[40%] flex-wrap justify-end gap-1 md:flex">
        {groups.map((g) => (
          <span key={g.groupId} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {g.name}
          </span>
        ))}
      </div>
      <StatusPill active={Boolean(member.profession)} />
    </li>
  );
}

function EmptyPeople({ view, hasMembers }: { view: View; hasMembers: boolean }) {
  const text = !hasMembers
    ? 'No one has joined this department yet. Invites come from your organization admin.'
    : view.kind === 'group'
      ? 'No one in this group yet. Go to All people, select workers and choose “Add to group”.'
      : view.kind === 'ungrouped'
        ? 'Everyone here is in at least one group.'
        : 'No one matches your search.';
  return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{text}</p>;
}
