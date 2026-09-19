'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'aws-amplify/auth';

import { GlobeBrandPanel } from '@/components/visual/globe-brand-panel';
import { configureAmplify } from '@/lib/amplify';
import { useI18n } from '@/i18n/provider';
import type { Locale } from '@/i18n/config';
import type { Role } from '@/lib/types';

/**
 * Sign in screen — tactile Neumorphic industrial finish.
 *
 * Supports all three roles:
 * - Worker: Arrives via employer invite code (or returning phone login) -> /plan
 * - Manager: Plant supervisors and training leads -> /dashboard
 * - Admin: Organization and IT administration -> /users
 */
export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();

  // Active role tab: 'worker' | 'manager' | 'admin'
  const [activeRole, setActiveRole] = useState<Role>('worker');

  // Worker view sub-mode: 'invite' (default for new workers) vs 'phone' (returning workers)
  const [workerMode, setWorkerMode] = useState<'invite' | 'phone'>('invite');

  // Invite code input
  const [inviteCode, setInviteCode] = useState('');

  // Credentials inputs
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRoleChange = (newRole: Role) => {
    setActiveRole(newRole);
    setError(null);
  };

  const handleWorkerInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = inviteCode.trim().toUpperCase();
    if (!cleanCode) {
      setError(t('auth.inviteRequired'));
      return;
    }

    router.push(`/invite/${encodeURIComponent(cleanCode)}`);
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = identifier.trim();
    if (!cleanId) {
      setError(t('auth.identifierRequired'));
      return;
    }

    if (!password) {
      setError(t('auth.enterPassword'));
      return;
    }

    const formattedUsername =
      activeRole === 'worker' && !cleanId.includes('@')
        ? cleanId.startsWith('+')
          ? cleanId
          : `+91${cleanId.replace(/\D/g, '')}`
        : cleanId.toLowerCase();

    try {
      setLoading(true);
      configureAmplify();
      const output = await signIn({ username: formattedUsername, password });

      if (output.isSignedIn) {
        router.push('/');
        return;
      }
    } catch {
      setError(t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-1 neu-bg">
      {/* Brand panel: desktop only */}
      <div className="hidden w-1/2 overflow-hidden lg:block">
        <GlobeBrandPanel text="SkillBridge" />
      </div>

      <div className="flex w-full flex-col justify-between px-6 py-8 lg:w-1/2 lg:px-14">
        {/* Top bar: Brand + Language selector */}
        <div className="flex items-center justify-between">
          <Link href="/welcome" className="inline-flex items-center gap-2.5">
            <span className="size-3 rounded-full bg-primary neu-raised" />
            <span className="text-base font-bold tracking-tight text-foreground">
              SkillBridge
            </span>
          </Link>

          {/* Neumorphic locale switcher */}
          <div className="neu-sunken inline-flex items-center rounded-xl p-1 text-xs">
            {(
              [
                ['en', 'English'],
                ['hi', 'हिन्दी'],
                ['mr', 'मराठी'],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code as Locale)}
                className={`rounded-lg px-3 py-1.5 transition-all ${
                  locale === code
                    ? 'neu-raised font-semibold text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Center Content: Neumorphic Card */}
        <div className="mx-auto w-full max-w-md py-6">
          <div className="neu-card p-7 sm:p-9">
            {/* Neumorphic Role Switcher Tabs */}
            <div className="neu-sunken mb-7 flex rounded-xl p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => handleRoleChange('worker')}
                className={`flex-1 rounded-lg py-2.5 text-center transition-all ${
                  activeRole === 'worker'
                    ? 'neu-raised font-bold text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('auth.roleWorker')}
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('manager')}
                className={`flex-1 rounded-lg py-2.5 text-center transition-all ${
                  activeRole === 'manager'
                    ? 'neu-raised font-bold text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('auth.roleManager')}
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('admin')}
                className={`flex-1 rounded-lg py-2.5 text-center transition-all ${
                  activeRole === 'admin'
                    ? 'neu-raised font-bold text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('auth.roleAdmin')}
              </button>
            </div>

            {/* =======================================================
               ROLE: WORKER
               ======================================================= */}
            {activeRole === 'worker' ? (
              <div>
                {workerMode === 'invite' ? (
                  /* Worker: Primary Invite Code Access */
                  <div>
                    <div className="neu-raised inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-primary">
                      <span className="size-1.5 rounded-full bg-primary" />
                      Worker Invite
                    </div>

                    <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                      {t('auth.inviteOnlyTitle')}
                    </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                      {t('auth.workerSubtitle')}
                    </p>

                    <form onSubmit={handleWorkerInviteSubmit} className="mt-6 flex flex-col gap-4">
                      <div>
                        <label
                          htmlFor="invite-code-input"
                          className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
                        >
                          {t('auth.inviteCode')}
                        </label>
                        <input
                          id="invite-code-input"
                          type="text"
                          autoFocus
                          autoCapitalize="characters"
                          autoComplete="off"
                          spellCheck={false}
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                          placeholder={t('auth.inviteCodePlaceholder')}
                          className="neu-input min-h-12 w-full rounded-xl px-4 font-mono text-base uppercase tracking-widest text-foreground outline-none placeholder:text-muted-foreground/45 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
                        />
                      </div>

                      {error ? (
                        <p role="alert" className="text-xs font-medium text-danger">
                          {error}
                        </p>
                      ) : null}

                      <button
                        type="submit"
                        className="neu-btn-primary mt-2 flex min-h-12 w-full items-center justify-center rounded-xl text-sm font-semibold tracking-wide"
                      >
                        {t('auth.continueWithInvite')} &rarr;
                      </button>
                    </form>

                    <div className="mt-7 pt-5 border-t border-black/5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setWorkerMode('phone');
                          setError(null);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors underline underline-offset-4"
                      >
                        {t('auth.signInWithPhone')}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Worker: Returning Phone + Password */
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                      {t('auth.signInWorker')}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('auth.signInSubtitle')}
                    </p>

                    <form onSubmit={handleCredentialsSubmit} className="mt-6 flex flex-col gap-4">
                      <div>
                        <label
                          htmlFor="worker-phone-input"
                          className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
                        >
                          {t('auth.phone')}
                        </label>
                        <div className="neu-input flex rounded-xl">
                          <span className="inline-flex items-center border-r border-black/10 px-3.5 text-sm font-medium text-muted-foreground select-none">
                            +91
                          </span>
                          <input
                            id="worker-phone-input"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder={t('auth.phonePlaceholder')}
                            className="min-h-11 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="worker-password-input"
                          className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
                        >
                          {t('auth.password')}
                        </label>
                        <div className="neu-input relative flex items-center rounded-xl">
                          <input
                            id="worker-password-input"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="min-h-11 w-full bg-transparent px-3.5 pr-16 text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                          </button>
                        </div>
                      </div>

                      {error ? (
                        <p role="alert" className="text-xs font-medium text-danger">
                          {error}
                        </p>
                      ) : null}

                      <button
                        type="submit"
                        disabled={loading}
                        className="neu-btn-primary mt-2 flex min-h-12 w-full items-center justify-center rounded-xl text-sm font-semibold tracking-wide disabled:opacity-50"
                      >
                        {loading ? t('auth.signingIn') : `${t('auth.signInWorker')} →`}
                      </button>
                    </form>

                    <div className="mt-7 pt-5 border-t border-black/5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setWorkerMode('invite');
                          setError(null);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors underline underline-offset-4"
                      >
                        {t('auth.enterCodeInstead')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* =======================================================
               ROLE: MANAGER
               ======================================================= */}
            {activeRole === 'manager' ? (
              <div>
                <div className="neu-raised inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <span className="size-1.5 rounded-full bg-amber-600" />
                  Supervisor Console
                </div>

                <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                  {t('auth.signInManager')}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {t('auth.managerSubtitle')}
                </p>

                <form onSubmit={handleCredentialsSubmit} className="mt-6 flex flex-col gap-4">
                  <div>
                    <label
                      htmlFor="manager-id-input"
                      className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
                    >
                      {t('auth.email')} / {t('auth.phone')}
                    </label>
                    <input
                      id="manager-id-input"
                      type="text"
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="manager@company.com"
                      className="neu-input min-h-11 w-full rounded-xl px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="manager-password-input"
                      className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
                    >
                      {t('auth.password')}
                    </label>
                    <div className="neu-input relative flex items-center rounded-xl">
                      <input
                        id="manager-password-input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="min-h-11 w-full bg-transparent px-3.5 pr-16 text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                      </button>
                    </div>
                  </div>

                  {error ? (
                    <p role="alert" className="text-xs font-medium text-danger">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className="neu-btn-primary mt-2 flex min-h-12 w-full items-center justify-center rounded-xl text-sm font-semibold tracking-wide disabled:opacity-50"
                  >
                    {loading ? t('auth.signingIn') : `${t('auth.signInManager')} →`}
                  </button>
                </form>
              </div>
            ) : null}

            {/* =======================================================
               ROLE: ADMIN
               ======================================================= */}
            {activeRole === 'admin' ? (
              <div>
                <div className="neu-raised inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-600" />
                  Enterprise Admin
                </div>

                <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                  {t('auth.signInAdmin')}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {t('auth.adminSubtitle')}
                </p>

                <form onSubmit={handleCredentialsSubmit} className="mt-6 flex flex-col gap-4">
                  <div>
                    <label
                      htmlFor="admin-email-input"
                      className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
                    >
                      {t('auth.adminEmail')}
                    </label>
                    <input
                      id="admin-email-input"
                      type="email"
                      autoComplete="email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={t('auth.adminEmailPlaceholder')}
                      className="neu-input min-h-11 w-full rounded-xl px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="admin-password-input"
                      className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
                    >
                      {t('auth.password')}
                    </label>
                    <div className="neu-input relative flex items-center rounded-xl">
                      <input
                        id="admin-password-input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="min-h-11 w-full bg-transparent px-3.5 pr-16 text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                      </button>
                    </div>
                  </div>

                  {error ? (
                    <p role="alert" className="text-xs font-medium text-danger">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className="neu-btn-primary mt-2 flex min-h-12 w-full items-center justify-center rounded-xl text-sm font-semibold tracking-wide disabled:opacity-50"
                  >
                    {loading ? t('auth.signingIn') : `${t('auth.signInAdmin')} →`}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>

        {/*
          No quick-test role buttons here. They set a `dev_role` cookie that the
          integrated auth does not honour -- sessions come from verified Cognito
          claims only -- so every one of them bounced the clicker straight back
          to this page. A control that silently does nothing is worse on a stage
          than no control at all.
        */}
        <div className="mx-auto w-full max-w-md pt-2">
          <p className="text-[11px] text-muted-foreground/70 text-center">
            Employer-provisioned access &bull; Tenant-isolated
          </p>
        </div>
      </div>
    </main>
  );
}
