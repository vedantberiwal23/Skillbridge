'use client';

import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="w-full bg-white footer-dots border-t border-neutral-200/60 pt-16 sm:pt-20 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-12">
        {/* Top 5-Column Navigation Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 lg:gap-14">
          {/* Column 1: Brand & Origin */}
          <div className="col-span-2 md:col-span-1 flex flex-col items-start">
            {/* Logo: 3 ascending rounded orange bars + SkillBridge */}
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <div className="flex items-end gap-1 h-7">
                <span className="w-1.5 h-3.5 rounded-full bg-[#f2621f]" />
                <span className="w-1.5 h-5 rounded-full bg-[#f2621f]" />
                <span className="w-1.5 h-7 rounded-full bg-[#f2621f]" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-neutral-900">
                SkillBridge
              </span>
            </Link>

            {/* Tagline & City */}
            <div className="mt-4 space-y-0.5">
              <p className="text-xs sm:text-sm text-neutral-500 font-normal">
                Real Skills. Real Impact.
              </p>
              <p className="text-xs sm:text-sm text-neutral-400 font-normal">
                Vellore, India
              </p>
            </div>

            {/* Accent orange bar */}
            <div className="mt-6 w-8 h-[2.5px] bg-[#f2621f] rounded-full" />

            {/* Sub-tagline uppercase */}
            <div className="mt-3.5 space-y-0.5">
              <p className="text-xs font-semibold tracking-[0.22em] text-neutral-400">
                SKILLED PEOPLE
              </p>
              <p className="text-xs font-semibold tracking-[0.22em] text-neutral-400">
                A STRONGER INDIA
              </p>
            </div>
          </div>

          {/* Column 2: COMPANY */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400 mb-5">
              COMPANY
            </h4>
            <ul className="space-y-3.5 text-sm font-medium text-neutral-800">
              <li>
                <Link href="#about" className="hover:text-[#f2621f] transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="#impact" className="hover:text-[#f2621f] transition-colors">
                  Impact
                </Link>
              </li>
              <li>
                <Link href="#careers" className="hover:text-[#f2621f] transition-colors">
                  Careers
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: PRODUCT */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400 mb-5">
              PRODUCT
            </h4>
            <ul className="space-y-3.5 text-sm font-medium text-neutral-800">
              <li>
                <Link href="#how-it-works" className="hover:text-[#f2621f] transition-colors">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="#organizations" className="hover:text-[#f2621f] transition-colors">
                  For Organizations
                </Link>
              </li>
              <li>
                <Link href="#demo" className="hover:text-[#f2621f] transition-colors">
                  Demo
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: RESOURCES */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400 mb-5">
              RESOURCES
            </h4>
            <ul className="space-y-3.5 text-sm font-medium text-neutral-800">
              <li>
                <Link href="#training" className="hover:text-[#f2621f] transition-colors">
                  Training
                </Link>
              </li>
              <li>
                <Link href="#machine-twins" className="hover:text-[#f2621f] transition-colors">
                  Machine Twins
                </Link>
              </li>
              <li>
                <Link href="#blog" className="hover:text-[#f2621f] transition-colors">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 5: SOCIAL */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400 mb-5">
              SOCIAL
            </h4>
            <ul className="space-y-3.5 text-sm font-medium text-neutral-800">
              <li>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#f2621f] transition-colors"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#f2621f] transition-colors"
                >
                  Instagram
                </a>
              </li>
              <li>
                <a
                  href="https://x.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#f2621f] transition-colors"
                >
                  X
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-neutral-200/80 mt-16 mb-6" />

        {/* Copyright & Legal Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p className="font-normal">
            &copy; 2026 SkillBridge. All rights reserved.
          </p>

          <div className="flex items-center gap-4">
            <Link
              href="#privacy"
              className="hover:text-neutral-900 transition-colors"
            >
              Privacy policy
            </Link>
            <span className="text-neutral-300">|</span>
            <Link
              href="#terms"
              className="hover:text-neutral-900 transition-colors"
            >
              Terms &amp; conditions
            </Link>
          </div>
        </div>

        {/* Top-Right Mission Tagline positioned right above the watermark */}
        <div className="flex justify-end pt-12 sm:pt-14 pb-2">
          <div className="flex flex-col items-end text-right">
            <span className="text-xs sm:text-xs font-semibold uppercase tracking-[0.24em] text-neutral-400 leading-relaxed">
              BUILT FOR THE<br />
              PEOPLE WHO KEEP<br />
              INDIA MOVING
            </span>
            <div className="mt-2 w-8 h-[2px] bg-[#f2621f] rounded-full" />
          </div>
        </div>
      </div>

      {/* Giant Solid Watermark across the very bottom */}
      <div
        aria-hidden
        className="w-full select-none pointer-events-none overflow-hidden flex justify-center -mb-8 sm:-mb-12 md:-mb-16"
      >
        <span
          className="block font-black tracking-tighter text-center leading-[0.8] text-neutral-200"
          style={{
            // Floor was 5rem, which renders ~420px of text in a 375px viewport and
            // clips the brand name on both sides. 17vw keeps it inside the screen.
            fontSize: 'clamp(2.75rem, 17vw, 19rem)',
            letterSpacing: '-0.04em',
          }}
        >
          SkillBridge
        </span>
      </div>
    </footer>
  );
}
