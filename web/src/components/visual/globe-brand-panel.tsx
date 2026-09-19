'use client';

import { useReducedMotion } from 'framer-motion';

import KineticTextGrid from '@/components/visual/kinetic-text';
import { useMinWidth } from '@/components/visual/use-min-width';
import { useAccessibility } from '@/components/providers/accessibility-provider';

/**
 * Brand panel for auth & induction screens — powered by Originkit Appear Text
 * (KineticTextGrid), providing a stunning kinetic typography canvas.
 */
export function GlobeBrandPanel({ text }: { text: string }) {
  const { prefer2D } = useAccessibility();
  const reducedMotion = useReducedMotion();
  const isWide = useMinWidth(1024);

  if (!isWide || prefer2D || reducedMotion) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0c1017]">
        <span className="text-4xl font-bold tracking-tight text-white">{text}</span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c1017]">
      <KineticTextGrid
        text={text.toUpperCase()}
        textColor="#ffffff"
        backgroundColor="#0c1017"
        rowCount={5}
        repeatCount={5}
        rowGap={18}
        wordGap={28}
        horizontalShiftPx={70}
        zoomScalePct={112}
        font={{
          fontWeight: 800,
          fontSize: 48,
          letterSpacing: '-0.03em',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c1017]/80 via-transparent to-[#0c1017]/40" />
      <div className="pointer-events-none absolute bottom-8 left-8 right-8 flex items-center justify-between text-xs text-white/50 border-t border-white/10 pt-4">
        <span className="uppercase tracking-widest font-mono text-[11px] text-white/70">
          Vocational Induction Terminal
        </span>
        <span className="font-mono text-[10px] text-white/40">Bharat Precision &bull; SkillBridge</span>
      </div>
    </div>
  );
}
