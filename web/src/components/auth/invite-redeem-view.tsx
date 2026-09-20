'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useI18n } from '@/i18n/provider';
import { GlobeBrandPanel } from '@/components/visual/globe-brand-panel';

interface InviteRedeemViewProps {
  code: string;
}

/**
 * Invite redemption view.
 *
 * Workers arrive via an SMS/email invite containing this code.
 * Setting their password provisions access and routes to onboarding.
 */
export function InviteRedeemView({ code }: InviteRedeemViewProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError(t('auth.enterPassword'));
      return;
    }

    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    try {
      setLoading(true);

      const res = await fetch('/api/invites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          password,
          phone: phone ? `+91${phone.replace(/\D/g, '')}` : undefined,
        }),
      }).catch(() => null);

      if (!res || !res.ok) {
        if (process.env.NODE_ENV !== 'production') {
          document.cookie = 'dev_role=worker; path=/; max-age=86400';
          router.push('/onboarding');
          return;
        }
        setError(t('auth.invalidCredentials'));
        return;
      }

      document.cookie = 'dev_role=worker; path=/; max-age=86400';
      router.push('/onboarding');
    } catch {
      setError(t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-1">
      {/* Same brand panel as /login — a new worker's first screen should feel
          like part of the same product as sign-in, not a bare form. */}
      <div className="hidden w-1/2 overflow-hidden lg:block">
        <GlobeBrandPanel text="SkillBridge" />
      </div>

      <div className="flex w-full flex-col justify-center bg-background px-6 py-12 lg:w-1/2">
      <div className="mx-auto w-full max-w-sm">
        <Link href="/lander" className="inline-flex items-center gap-2 mb-8">
          <span className="size-2 rounded-full bg-primary" />
          <span className="text-base font-semibold tracking-tight text-foreground">
            SkillBridge
          </span>
        </Link>

        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {t('auth.inviteCode')}: <span className="font-mono text-foreground font-semibold">{code.toUpperCase()}</span>
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t('auth.activateAccount')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bharat Precision Engineering &bull; {t('auth.inviteSubtitle')}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label
              htmlFor="redeem-phone"
              className="block text-xs font-medium text-muted-foreground"
            >
              {t('auth.phone')}
            </label>
            <div className="mt-1.5 flex rounded-md border border-border bg-card focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
              <span className="inline-flex items-center border-r border-border px-3 text-sm text-muted-foreground select-none">
                +91
              </span>
              <input
                id="redeem-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('auth.phonePlaceholder')}
                className="h-11 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="redeem-password"
              className="block text-xs font-medium text-muted-foreground"
            >
              {t('auth.setPassword')}
            </label>
            <div className="relative mt-1.5 flex items-center">
              <input
                id="redeem-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 w-full rounded-md border border-border bg-card px-3 pr-16 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-xs text-muted-foreground hover:text-foreground"
              >
                {showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="redeem-confirm-password"
              className="block text-xs font-medium text-muted-foreground"
            >
              {t('auth.confirmPassword')}
            </label>
            <input
              id="redeem-confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5 h-11 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
            />
          </div>

          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? t('auth.activating') : t('auth.activateAccount')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            {t('auth.alreadyActivated')}
          </Link>
        </div>
      </div>
      </div>
    </main>
  );
}
