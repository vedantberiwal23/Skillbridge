'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Award, BookOpen, Briefcase, Home, User } from 'lucide-react';
import { cn } from 'cn';

/**
 * The five worker destinations, shown as a top bar on a laptop and a bottom
 * bar on a phone. Same items, same order, same active state — only the place
 * they sit changes, so the product does not feel like two different apps
 * depending on the screen.
 */
export const WORKER_NAV = [
  { href: '/home', label: 'Home', icon: Home, tour: 'nav-home' },
  { href: '/learn', label: 'Learn', icon: BookOpen, tour: 'nav-learn' },
  { href: '/progress', label: 'Skills', icon: Award, tour: 'nav-skills' },
  { href: '/opportunities', label: 'Jobs', icon: Briefcase, tour: 'nav-jobs' },
  { href: '/profile', label: 'Profile', icon: User, tour: 'nav-profile' },
];

export function WorkerTopNav() {
  const pathname = usePathname();
  if (pathname.startsWith('/onboarding')) return null;

  return (
    <header className="sticky top-0 z-30 hidden border-b border-border bg-card/95 backdrop-blur lg:block">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-8">
        <Link href="/home" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            S
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">SkillBridge</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          {WORKER_NAV.map(({ href, label, icon: Icon, tour }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                data-tour={tour}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-2 rounded-xl px-4 text-base transition-colors',
                  active
                    ? 'bg-secondary font-semibold text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="size-4" strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
