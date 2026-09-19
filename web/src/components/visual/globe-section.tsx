'use client';

import GlobeStudy from '@/components/visual/globe-study';
import { useMinWidth } from '@/components/visual/use-min-width';
import { useAccessibility } from '@/components/providers/accessibility-provider';

/**
 * The globe is an always-running requestAnimationFrame canvas. It is gated on
 * width AND on the device's own data-saver/2g signal, and the gate controls
 * whether it mounts at all — a display:none canvas still animates.
 */
export function GlobeSection({ heading, eyebrow }: { heading: string; eyebrow: string }) {
  const isWide = useMinWidth(768);
  const { prefer2D } = useAccessibility();

  const show = isWide && !prefer2D;

  return (
    <section
      className="relative hidden border-t border-border overflow-hidden md:block"
      style={{
        height: 640,
        background: 'linear-gradient(135deg, #0F2540 0%, #1C3D5A 55%, #3A6896 100%)',
      }}
    >
      {show ? (
        <div className="absolute inset-0">
          <GlobeStudy
            // The component hardcodes minWidth 1200 / minHeight 800. `style` is
            // spread last inside it, so this is the supported way to clear them
            // and let it scale to the viewport.
            style={{ minWidth: 0, minHeight: 0 }}
            background="transparent"
            baseColor="#D6E8F5"
            phrase="everyworkerdeservestrainingtheycantrustandunderstand"
            density={80}
            glyphSize={85}
            speed={70}
            globe={{ drift: 120, radius: 100, letters: 100 }}
            pointer={{ zoom: 60, light: 100, pins: 5 }}
          />
        </div>
      ) : null}

      <div className="relative mx-auto max-w-7xl px-10 py-16 pointer-events-none">
        <p className="mb-3 text-xs font-data uppercase tracking-widest text-primary-foreground/60">
          {eyebrow}
        </p>
        <h2 className="max-w-md text-2xl font-semibold tracking-tight text-primary-foreground md:text-3xl">
          {heading}
        </h2>
      </div>
    </section>
  );
}
