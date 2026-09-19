'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BookOpen,
  Boxes,
  Building2,
  FileText,
  LayoutDashboard,
  Library,
  LogOut,
  Mail,
  Settings,
  Users,
  UsersRound,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { signOut } from 'aws-amplify/auth';
import { cn } from 'cn';

import { configureAmplify } from '@/lib/amplify';
import { TourLauncher } from '@/components/tour/tour-provider';

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Designed but not built. Shown so the console's scope is legible, never linked. */
  soon?: boolean;
};

const NAV: Record<'manager' | 'admin', NavItem[]> = {
  manager: [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/team', label: 'Team & groups', icon: UsersRound },
    { href: '/workers', label: 'Worker files', icon: FileText },
    { href: '/content', label: 'Learning content', icon: BookOpen, soon: true },
    { href: '/knowledge-base', label: 'Knowledge base', icon: Library, soon: true },
  ],
  admin: [
    { href: '/overview', label: 'Overview', icon: LayoutDashboard },
    { href: '/departments', label: 'Departments', icon: Building2 },
    { href: '/users', label: 'People', icon: Users },
    { href: '/invites', label: 'Invites', icon: Mail },
    { href: '/studio', label: 'Machine studio', icon: Boxes },
    { href: '/settings', label: 'Settings', icon: Settings, soon: true },
  ],
};

const SUBTITLE = { manager: 'Manager console', admin: 'Admin console' } as const;

/**
 * The console frame for managers and admins: a sidebar on desktop, a top bar
 * on a phone.
 *
 * Manager and admin screens are a console, not the worker's consumer app, so
 * they get persistent navigation rather than a bottom tab bar.
 */
export function ConsoleShell({
  role,
  children,
}: {
  role: 'manager' | 'admin';
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = NAV[role];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background lg:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <Brand subtitle={SUBTITLE[role]} className="px-5 pt-6" />
        <nav data-tour="console-nav" aria-label="Console" className="mt-8 flex flex-col gap-0.5 px-3">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-0.5 border-t border-border px-3 py-4">
          <TourLauncher />
          <SignOutButton />
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <Brand subtitle={SUBTITLE[role]} />
          <div className="flex items-center gap-1">
            <TourLauncher variant="icon" className="size-9" />
            <SignOutButton compact />
          </div>
        </div>
        <nav
          data-tour="console-nav"
          aria-label="Console"
          className="flex gap-1 overflow-x-auto px-3 pb-2 pt-3 [scrollbar-width:none]"
        >
          {nav.filter((item) => !item.soon).map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} compact />
          ))}
        </nav>
      </header>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ subtitle, className }: { subtitle: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        S
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-foreground">SkillBridge</span>
        <span className="block text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
    </div>
  );
}

function NavLink({ item, active, compact }: { item: NavItem; active: boolean; compact?: boolean }) {
  const Icon = item.icon;
  const body = (
    <>
      <Icon className="size-4 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
      <span className="truncate">{item.label}</span>
      {item.soon ? (
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Soon
        </span>
      ) : null}
    </>
  );
  const classes = cn(
    'flex items-center gap-2.5 rounded-lg text-sm transition-colors',
    compact ? 'shrink-0 px-3 py-1.5' : 'px-3 py-2',
    active
      ? 'bg-secondary font-semibold text-secondary-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    item.soon && 'pointer-events-none opacity-60'
  );

  if (item.soon) {
    return (
      <span aria-disabled className={classes}>
        {body}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      data-tour={`nav-${item.href.slice(1)}`}
      aria-current={active ? 'page' : undefined}
      className={classes}
    >
      {body}
    </Link>
  );
}

function SignOutButton({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setPending(true);
    try {
      configureAmplify();
      await signOut();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label="Sign out"
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
    >
      <LogOut className="size-4" strokeWidth={1.75} />
      Sign out
    </button>
  );
}
