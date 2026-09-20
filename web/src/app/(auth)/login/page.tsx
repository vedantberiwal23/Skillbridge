'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, signOut } from 'aws-amplify/auth';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from 'cn';

import { GlobeBrandPanel } from '@/components/visual/globe-brand-panel';
import { configureAmplify } from '@/lib/amplify';
import { useI18n } from '@/i18n/provider';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';

/**
 * Sign in.
 *
 * Two ways in, because there are only two: an invite code for someone who has
 * never signed in, and phone-or-email plus password for everyone else. The
 * earlier role tabs asked the wrong question — the role is on the account, not
 * something the person picks — so signing in just sends them to their own home.
 *
 * Phone and email are one field with a dropdown rather than two, so there is
 * never a wrong box to type into. Phone leads: most of this workforce has no
 * work email.
 */

type Tab = 'invite' | 'password';
type IdKind = 'phone' | 'email';

/** Matches the pool: phone sign-in is E.164, and bare Indian numbers get +91. */
function toUsername(kind: IdKind, raw: string) {
  const value = raw.trim();
  if (kind === 'email') return value.toLowerCase();
  if (value.startsWith('+')) return value;
  return `+91${value.replace(/\D/g, '')}`;
}

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('password');
  const [inviteCode, setInviteCode] = useState('');
  const [idKind, setIdKind] = useState<IdKind>('phone');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
  };

  const submitInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (!code) return setError(t('auth.inviteRequired'));
    router.push(`/invite/${encodeURIComponent(code)}`);
  };

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) return setError(t('auth.identifierRequired'));
    if (!password) return setError(t('auth.enterPassword'));
    try {
      setLoading(true);
      configureAmplify();

      /**
       * Sign whoever is already here out first.
       *
       * Amplify keeps tokens in cookies (`ssr: true`), so a session survives a
       * new tab and an emptied localStorage. `signIn` then throws
       * `UserAlreadyAuthenticatedException`, which the catch below reports as
       * "invalid credentials" — sending you to check a password that was never
       * wrong. It fires whenever someone signs in as one role and then tries
       * another without using Sign out.
       */
      try {
        await signOut();
      } catch {
        /* nobody was signed in, which is the normal case */
      }

      const output = await signIn({ username: toUsername(idKind, identifier), password });
      if (output.isSignedIn) router.push('/');
      else setError(t('auth.invalidCredentials'));
    } catch {
      setError(t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-1 bg-background">
      <div className="hidden w-1/2 overflow-hidden lg:block">
        <GlobeBrandPanel text="SkillBridge" />
      </div>

      <div className="flex w-full flex-col px-6 py-6 sm:px-10 lg:w-1/2 lg:px-16">
        <div className="flex items-center justify-between">
          <Link href="/lander" className="inline-flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              S
            </span>
            <span className="text-lg font-semibold tracking-tight text-foreground">SkillBridge</span>
          </Link>
          <div className="inline-flex rounded-xl border border-border bg-card p-1">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code as Locale)}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  locale === code ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {LOCALE_LABELS[code]}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('auth.signIn')}
          </h1>
          <p className="mt-2 text-base text-muted-foreground">{t('auth.signInSubtitle')}</p>

          <div className="mt-7 inline-flex rounded-xl border border-border bg-card p-1">
            {(
              [
                ['password', t('auth.signIn')],
                ['invite', t('auth.inviteCode')],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => switchTab(value)}
                aria-pressed={tab === value}
                className={cn(
                  'h-11 flex-1 rounded-lg px-5 text-base font-medium transition-colors',
                  tab === value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'password' ? (
            <form onSubmit={submitCredentials} className="mt-6 flex flex-col gap-5">
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-foreground">
                  {idKind === 'phone' ? t('auth.phone') : t('auth.email')}
                </label>
                {/* One field, one dropdown: there is no wrong box to type into. */}
                <div className="mt-2 flex h-14 items-center rounded-xl border border-border bg-card focus-within:border-primary">
                  <select
                    value={idKind}
                    onChange={(e) => {
                      setIdKind(e.target.value as IdKind);
                      setIdentifier('');
                      setError(null);
                    }}
                    aria-label="Sign in with"
                    className="h-full shrink-0 rounded-l-xl bg-transparent pl-4 pr-2 text-base font-medium text-foreground outline-none"
                  >
                    {/* Short labels: the field's own label above already says which it is. */}
                    <option value="phone">Phone</option>
                    <option value="email">Email</option>
                  </select>
                  <span aria-hidden className="h-7 w-px bg-border" />
                  {idKind === 'phone' ? (
                    <span className="pl-3 text-base text-muted-foreground">+91</span>
                  ) : null}
                  <input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    type={idKind === 'phone' ? 'tel' : 'email'}
                    inputMode={idKind === 'phone' ? 'numeric' : 'email'}
                    autoComplete={idKind === 'phone' ? 'tel' : 'email'}
                    placeholder={idKind === 'phone' ? t('auth.phonePlaceholder') : t('auth.emailPlaceholder')}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground">
                  {t('auth.password')}
                </label>
                <div className="mt-2 flex h-14 items-center rounded-xl border border-border bg-card focus-within:border-primary">
                  <input
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={t('auth.enterPassword')}
                    className="h-full min-w-0 flex-1 bg-transparent px-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              {error ? (
                <p role="alert" className="rounded-xl border border-danger/30 px-4 py-3 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-60"
              >
                {loading ? <Loader2 className="size-5 animate-spin" /> : null}
                {loading ? t('auth.signingIn') : t('auth.signIn')}
                {loading ? null : <ArrowRight className="size-5" />}
              </button>

              <p className="text-center text-sm text-muted-foreground">
                {t('auth.haveInvite').split('?')[0]}?{' '}
                <button
                  type="button"
                  onClick={() => switchTab('invite')}
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  {t('auth.activateAccount')}
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={submitInvite} className="mt-6 flex flex-col gap-5">
              <div>
                <label htmlFor="invite" className="block text-sm font-medium text-foreground">
                  {t('auth.inviteCode')}
                </label>
                <p className="mt-1 text-sm text-muted-foreground">{t('auth.invitePrompt')}</p>
                <input
                  id="invite"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  placeholder={t('auth.inviteCodePlaceholder')}
                  className="mt-2 h-14 w-full rounded-xl border border-border bg-card px-4 font-data text-lg uppercase tracking-[0.2em] text-foreground outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus:border-primary"
                />
              </div>

              {error ? (
                <p role="alert" className="rounded-xl border border-danger/30 px-4 py-3 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
              >
                {t('auth.continueWithInvite')} <ArrowRight className="size-5" />
              </button>

              <p className="text-center text-sm text-muted-foreground">
                {t('auth.alreadyActivated').split('?')[0]}?{' '}
                <button
                  type="button"
                  onClick={() => switchTab('password')}
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  {t('auth.signIn')}
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground lg:text-left">
          SkillBridge is invite-only. Accounts are created by your employer.
        </p>
      </div>
    </main>
  );
}
