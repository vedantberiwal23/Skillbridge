'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Award, Briefcase, User } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * The five places a worker can be, ever. This is the whole information
 * architecture — anything not reachable from one of these five taps does not
 * exist for this product. Order matters: it is the order a new worker should
 * think about the product (start learning, then prove it, then use it).
 */
const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/learn', label: 'Learn', icon: BookOpen },
  { href: '/progress', label: 'Skills', icon: Award },
  { href: '/opportunities', label: 'Jobs', icon: Briefcase },
  { href: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  // Do not render the bottom navigation during the onboarding setup flow
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) {
    return null;
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          // A worker on /learn/hydraulics is still "on" Learn — match the
          // section, not just the exact URL.
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex min-w-16 flex-1 flex-col items-center gap-1 py-2.5 text-muted-foreground transition-colors"
            >
              <Icon
                className={active ? 'size-6 text-primary' : 'size-6'}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span
                className={
                  active
                    ? 'text-[11px] font-semibold text-primary'
                    : 'text-[11px] font-medium'
                }
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
