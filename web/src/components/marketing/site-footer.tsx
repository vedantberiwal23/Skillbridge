'use client';

import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="w-full px-4 sm:px-6 md:px-10 pb-12 pt-6">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[28px] border border-border/70 bg-card p-8 sm:p-12 md:p-16 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        {/* Main Grid: Left Logo & Entity + Right 4 Columns */}
        <div className="relative z-10 grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-12">
          {/* Left Brand info */}
          <div className="flex flex-col items-start">
            {/* Squircle logo badge matching screenshot */}
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6B00] via-[#F4511E] to-[#E64A19] text-white shadow-lg shadow-orange-500/25 transition-transform hover:scale-105">
              <svg viewBox="0 0 24 24" className="size-7" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
              </svg>
            </div>

            <h3 className="mt-5 text-sm font-semibold text-foreground tracking-tight">
              SkillBridge Technologies Pvt Ltd
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Bengaluru &bull; Pune, India
            </p>
            <p className="mt-2 text-xs text-muted-foreground/80">
              &copy; {new Date().getFullYear()} SkillBridge. All rights reserved.
            </p>
          </div>

          {/* Column 1: Legal */}
          <div>
            <h4 className="text-xs font-semibold text-foreground tracking-wide">Legal</h4>
            <ul className="mt-4 flex flex-col gap-3 text-xs text-muted-foreground">
              <li>
                <Link href="#" className="transition-colors hover:text-foreground">
                  Trust Center
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-foreground">
                  Terms &amp; conditions
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-foreground">
                  Privacy policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Product */}
          <div>
            <h4 className="text-xs font-semibold text-foreground tracking-wide">Product</h4>
            <ul className="mt-4 flex flex-col gap-3 text-xs text-muted-foreground">
              <li>
                <Link href="/login" className="transition-colors hover:text-foreground">
                  Log in
                </Link>
              </li>
              <li>
                <Link href="/login" className="transition-colors hover:text-foreground">
                  Sign up
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-foreground">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Content */}
          <div>
            <h4 className="text-xs font-semibold text-foreground tracking-wide">Content</h4>
            <ul className="mt-4 flex flex-col gap-3 text-xs text-muted-foreground">
              <li>
                <Link href="#" className="transition-colors hover:text-foreground">
                  Templates
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-foreground">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-foreground leading-snug">
                  What is an AI knowledge base?
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Social */}
          <div>
            <h4 className="text-xs font-semibold text-foreground tracking-wide">Social</h4>
            <ul className="mt-4 flex flex-col gap-3 text-xs text-muted-foreground">
              <li>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  X (formerly Twitter)
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Giant Outlined Watermark across bottom of card, exactly matching reference screenshot */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-[-15%] z-0 select-none text-center"
        >
          <span
            className="block font-extrabold tracking-tighter leading-none text-transparent"
            style={{
              fontSize: 'clamp(4.5rem, 16vw, 15rem)',
              WebkitTextStroke: '1.5px rgba(0, 0, 0, 0.045)',
            }}
          >
            skillbridge
          </span>
        </div>
      </div>
    </footer>
  );
}
