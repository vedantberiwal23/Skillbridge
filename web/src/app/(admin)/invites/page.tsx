'use client';

import { useState } from 'react';

import { issueInvite, ApiError } from '@/lib/api-client';
import { useDepartments } from '@/components/console/use-departments';
import type { Invite } from '@/lib/types';
import type { Role } from '@/lib/types';

/**
 * Issue a worker invite — the first step of the demo spine.
 *
 * This is the only way an account comes into existence. `selfSignUpEnabled` is
 * false on the user pool, so there is no registration screen anywhere; an admin
 * issues a code here, and the worker redeems it at `/invite/[code]`, which is
 * where the Cognito user is actually created.
 *
 * The org is deliberately absent from this form. `POST /api/invites` reads it
 * from the verified session and stamps it onto the stored invite, and
 * redemption later reads `role`, `orgId` and `deptId` back off that item rather
 * than from the redeeming request — so the tenant never travels through a
 * browser at any point in the flow.
 */
const ROLES: Role[] = ['worker', 'manager', 'admin'];

export default function AdminInvitesPage() {
  const [role, setRole] = useState<Role>('worker');
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [contact, setContact] = useState('');
  const { departments } = useDepartments();
  // null = not chosen yet, so the first real department is the default once
  // they load; '' = deliberately unassigned.
  const [deptChoice, setDeptChoice] = useState<string | null>(null);
  const deptId = deptChoice ?? departments[0]?.deptId ?? '';
  const [issued, setIssued] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIssued(null);

    const trimmed = contact.trim();
    if (!trimmed) {
      setError(channel === 'sms' ? 'A phone number is required.' : 'An email is required.');
      return;
    }

    setBusy(true);
    try {
      const { invite } = await issueInvite({
        role,
        channel,
        // Empty means unassigned. The key builder maps a null department to the
        // DEPT#NONE sentinel so GSI1 begins_with still finds these users.
        deptId: deptId.trim() || null,
        ...(channel === 'sms'
          ? { phone: trimmed.startsWith('+') ? trimmed : `+91${trimmed.replace(/\D/g, '')}` }
          : { email: trimmed.toLowerCase() }),
      });
      setIssued(invite);
      setContact('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not issue the invite.');
    } finally {
      setBusy(false);
    }
  };

  const link = issued ? `${window.location.origin}/invite/${issued.code}` : '';

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Invite people</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accounts exist only by redeeming an invite. There is no sign-up page.
        </p>
      </header>

      <form data-tour="invite-form" onSubmit={submit} className="mt-8 flex flex-col gap-6">
        <Field label="Role">
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition ${
                  role === r
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Send by">
          <div className="flex gap-2">
            {(['sms', 'email'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium uppercase transition ${
                  channel === c
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            SMS is the default: most of this workforce has no work email address.
          </p>
        </Field>

        <Field label={channel === 'sms' ? 'Phone number' : 'Email address'}>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            type={channel === 'sms' ? 'tel' : 'email'}
            placeholder={channel === 'sms' ? '98765 43210' : 'worker@company.com'}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground"
          />
        </Field>

        <Field label="Department">
          <select
            value={deptId}
            onChange={(e) => setDeptChoice(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground"
          >
            {departments.map((d) => (
              <option key={d.deptId} value={d.deptId}>
                {d.name}
              </option>
            ))}
            <option value="">No department yet — assign later</option>
          </select>
          {departments.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              No departments yet. Create them under Departments so invites land in the right place.
            </p>
          ) : null}
        </Field>

        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? 'Issuing…' : 'Issue invite'}
        </button>
      </form>

      {error ? <p className="mt-6 text-sm text-danger">{error}</p> : null}

      {issued ? (
        <section className="mt-8 rounded-xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Invite issued
          </p>
          <p className="mt-3 font-mono text-2xl font-semibold tracking-wider text-foreground">
            {issued.code}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {issued.role} &bull; {issued.deptId ?? 'no department'} &bull; expires{' '}
            {new Date(issued.expiresAt).toLocaleDateString()}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <code className="flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {link}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(link).then(
                  () => setCopied(true),
                  () => setCopied(false)
                );
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
