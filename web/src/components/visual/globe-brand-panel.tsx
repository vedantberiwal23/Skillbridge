'use client';

import { useReducedMotion } from 'framer-motion';

import GlobeStudy from '@/components/visual/globe-study';
import { useMinWidth } from '@/components/visual/use-min-width';
import { useAccessibility } from '@/components/providers/accessibility-provider';

/**
 * Brand moment for auth screens (login, invite redemption) — the same moving
 * globe used on /welcome and /learn, so the "SkillBridge" brand reads as one
 * consistent thing across marketing, the app, and sign-in, instead of two
 * different animated backgrounds (this used to be a separate kinetic-text
 * panel; see git history on brand-panel.tsx for that version).
 *
 * Same three-way safety gate as the rest of this app's motion:
 *   viewport       — checked in JS, not just `hidden lg:block`; a CSS-hidden
 *                    canvas still runs its rAF loop unless we skip mounting it.
 *   prefer2D       — accessibility mode / device data-saver signal.
 *   reduced-motion — GlobeStudy drives a canvas from JS, so the CSS media
 *                    query in globals.css cannot stop it on its own.
 * Any of the three falls back to a plain wordmark on the brand color, held
 * still.
 */
export function GlobeBrandPanel({ text }: { text: string }) {
  const { prefer2D } = useAccessibility();
  const reducedMotion = useReducedMotion();
  const isWide = useMinWidth(1024);

  if (!isWide || prefer2D || reducedMotion) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-primary">
        <span className="text-4xl font-bold tracking-tight text-primary-foreground">{text}</span>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #161d25 0%, #1a2430 55%, #12181f 100%)' }}
    >
      <GlobeStudy
        style={{ minWidth: 0, minHeight: 0, position: 'absolute', inset: 0 }}
        background="transparent"
        baseColor="#bfe8c9"
        phrase="everyworkerdeservestrainingtheycantrustandunderstand"
        density={80}
        glyphSize={85}
        speed={70}
        globe={{ drift: 120, radius: 100, letters: 100 }}
        pointer={{ zoom: 60, light: 100, pins: 5 }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-4xl font-bold tracking-tight text-white">{text}</span>
      </div>
    </div>
  );
}
