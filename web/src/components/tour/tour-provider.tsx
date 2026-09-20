'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Compass, X } from 'lucide-react';
import { cn } from 'cn';

import { useI18n } from '@/i18n/provider';
import type { Locale } from '@/i18n/config';
import type { Role } from '@/lib/types';
import { TOURS, tourCopy } from './tour-steps';

/**
 * Guided product tour with a spotlight.
 *
 * The step's target stays lit and everything else is dimmed, with a card
 * beside it explaining what it is. It is a separate layer over the page, not
 * something each screen renders, so a screen only has to carry a `data-tour`
 * attribute to be tourable.
 *
 * The spotlight is a single element with an oversized box-shadow rather than
 * an SVG mask: box-shadow and top/left/width/height transition in every
 * browser, so the light glides from one target to the next instead of jumping.
 *
 * Seen-state lives in localStorage. It is a per-device convenience — losing it
 * costs someone one extra tour, which is harmless — so it is not worth a
 * DynamoDB write.
 */

const MARGIN = 16;
const GAP = 14;
const PAD = 8;
const FIND_TIMEOUT_MS = 2500;
const AUTO_START_DELAY_MS = 700;

type Rect = { top: number; left: number; width: number; height: number };

interface TourContextValue {
  start: () => void;
  active: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

const UI: Record<Locale, { next: string; back: string; done: string; skip: string; of: string; replay: string }> = {
  en: { next: 'Next', back: 'Back', done: 'Finish', skip: 'Skip tour', of: 'of', replay: 'Take the tour' },
  hi: { next: 'आगे', back: 'पीछे', done: 'पूरा करें', skip: 'Tour छोड़ें', of: '/', replay: 'Tour देखें' },
  mr: { next: 'पुढे', back: 'मागे', done: 'पूर्ण करा', skip: 'Tour वगळा', of: '/', replay: 'Tour पाहा' },
};

const seenKey = (role: Role, version: number) => `sb.tour.${role}.v${version}`;

function readSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSeen(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Private mode or blocked storage: the tour just shows again next time.
  }
}

/** First matching element that is actually laid out — a hidden duplicate has a zero rect. */
function findTarget(name: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return node;
  }
  return null;
}

function sameRect(a: Rect | null, b: Rect | null) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TourProvider({
  role,
  autoStart = true,
  children,
}: {
  role: Role;
  /** False holds auto-start back, e.g. until the worker has finished onboarding. */
  autoStart?: boolean;
  children: React.ReactNode;
}) {
  const script = TOURS[role];
  const key = seenKey(role, script.version);
  const router = useRouter();
  const pathname = usePathname();

  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);

  const active = index !== null;
  const step = active ? script.steps[index] : null;

  const start = useCallback(() => {
    setRect(null);
    setReady(false);
    setIndex(0);
  }, []);

  const finish = useCallback(() => {
    writeSeen(key);
    setIndex(null);
    setRect(null);
    setReady(false);
  }, [key]);

  const go = useCallback(
    (delta: 1 | -1) => {
      if (index === null) return;
      const nextIndex = index + delta;
      if (nextIndex < 0) return;
      if (nextIndex >= script.steps.length) {
        finish();
        return;
      }
      setIndex(nextIndex);
    },
    [index, finish, script.steps.length]
  );

  // Auto-start once per device, on the tour's own start route. `?tour=1` forces
  // it — onboarding sends the worker here with that flag.
  useEffect(() => {
    if (active || !autoStart || pathname !== script.startRoute) return;
    const timer = setTimeout(() => {
      const forced = new URLSearchParams(window.location.search).get('tour') === '1';
      if (forced) router.replace(pathname);
      if (forced || !readSeen(key)) start();
    }, AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, autoStart, pathname, script.startRoute, key, router, start]);

  // Resolve the current step: navigate if needed, then find and follow its target.
  useEffect(() => {
    if (!step) return;
    if (step.route && pathname !== step.route) {
      router.push(step.route);
      return; // re-runs once the pathname changes
    }

    let frame = 0;
    let cancelled = false;
    const began = performance.now();
    let target: HTMLElement | null = null;
    let scrolled = false;

    const tick = () => {
      if (cancelled) return;
      if (!step.target) {
        setRect(null);
        setReady(true);
        return;
      }
      if (!target || !target.isConnected) {
        target = findTarget(step.target);
        if (!target) {
          if (performance.now() - began > FIND_TIMEOUT_MS) {
            setRect(null);
            setReady(true); // fall back to a centred card rather than stall
            return;
          }
          frame = requestAnimationFrame(tick);
          return;
        }
      }
      if (!scrolled) {
        scrolled = true;
        const r = target.getBoundingClientRect();
        const offscreen = r.top < MARGIN || r.bottom > window.innerHeight - MARGIN;
        if (offscreen) {
          target.scrollIntoView({
            block: r.height > window.innerHeight * 0.7 ? 'start' : 'center',
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          });
        }
      }
      // Measured every frame while the step is up: smooth scrolling, layout
      // shifts from data arriving and window resizes all move the target, and
      // following it continuously is simpler than subscribing to each cause.
      const r = target.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRect((prev) => (sameRect(prev, next) ? prev : next));
      setReady(true);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [step, pathname, router]);

  // Keyboard: arrows and Enter step through, Escape leaves.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finish, go]);

  const value = useMemo(() => ({ start, active }), [start, active]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && step && ready
        ? createPortal(
            <TourOverlay
              rect={rect}
              stepNumber={index + 1}
              total={script.steps.length}
              copy={step}
              onNext={() => go(1)}
              onBack={() => go(-1)}
              onSkip={finish}
            />,
            document.body
          )
        : null}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>');
  return ctx;
}

function TourOverlay({
  rect,
  stepNumber,
  total,
  copy,
  onNext,
  onBack,
  onSkip,
}: {
  rect: Rect | null;
  stepNumber: number;
  total: number;
  copy: (typeof TOURS)[Role]['steps'][number];
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const { locale } = useI18n();
  const ui = UI[locale];
  const { title, body } = tourCopy(copy, locale);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() => setCardHeight(card.offsetHeight));
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [stepNumber]);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const hole = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  const cardStyle = placeCard(hole, cardHeight, viewport.w, viewport.h);
  const last = stepNumber === total;

  return (
    <div className="fixed inset-0 z-[100]" data-tour-overlay>
      {/* Swallows clicks so the page underneath cannot be driven mid-tour. */}
      <div className="absolute inset-0" aria-hidden onClick={(e) => e.stopPropagation()} />

      {hole ? (
        <div
          aria-hidden
          className="tour-spotlight pointer-events-none absolute rounded-xl"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
          }}
        />
      ) : (
        <div aria-hidden className="tour-dim pointer-events-none absolute inset-0" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="tour-card absolute rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none"
        style={cardStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="font-data text-xs font-medium uppercase tracking-[0.14em] text-primary">
            {stepNumber} {ui.of} {total}
          </p>
          <button
            type="button"
            onClick={onSkip}
            aria-label={ui.skip}
            className="-mr-1.5 -mt-1.5 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <h2 id="tour-title" className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>

        <div className="mt-4 flex gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 rounded-full transition-all',
                i + 1 === stepNumber ? 'w-5 bg-primary' : i + 1 < stepNumber ? 'w-2 bg-primary/40' : 'w-2 bg-border'
              )}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {last ? '' : ui.skip}
          </button>
          <div className="flex items-center gap-2">
            {stepNumber > 1 ? (
              <button
                type="button"
                onClick={onBack}
                className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {ui.back}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onNext}
              className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
            >
              {last ? ui.done : ui.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Where the card goes: below the target if it fits, else above, else beside it,
 * else pinned to the bottom. On a phone it is always a full-width sheet on the
 * half of the screen the target is not on.
 */
function placeCard(
  hole: Rect | null,
  cardHeight: number,
  vw: number,
  vh: number
): React.CSSProperties {
  const width = Math.min(380, vw - MARGIN * 2);

  if (!hole) {
    return {
      width: Math.min(440, vw - MARGIN * 2),
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  if (vw < 640) {
    const targetMid = hole.top + hole.height / 2;
    return targetMid > vh / 2
      ? { left: MARGIN, right: MARGIN, top: `max(${MARGIN}px, env(safe-area-inset-top))` }
      : { left: MARGIN, right: MARGIN, bottom: `calc(${MARGIN}px + env(safe-area-inset-bottom))` };
  }

  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - width - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - cardHeight - MARGIN);
  const centredX = clampX(hole.left + hole.width / 2 - width / 2);

  const below = hole.top + hole.height + GAP;
  if (below + cardHeight + MARGIN <= vh) return { width, left: centredX, top: below };

  const above = hole.top - GAP - cardHeight;
  if (above >= MARGIN) return { width, left: centredX, top: above };

  const right = hole.left + hole.width + GAP;
  if (right + width + MARGIN <= vw) return { width, left: right, top: clampY(hole.top) };

  const left = hole.left - GAP - width;
  if (left >= MARGIN) return { width, left, top: clampY(hole.top) };

  return { width, left: clampX(vw - width - MARGIN), top: vh - cardHeight - MARGIN };
}

/** The replay button. Carries `data-tour="tour-launcher"` so the last step can point at it. */
export function TourLauncher({
  variant = 'button',
  className,
}: {
  variant?: 'button' | 'icon';
  className?: string;
}) {
  const { start } = useTour();
  const { locale } = useI18n();
  const label = UI[locale].replay;

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={start}
        data-tour="tour-launcher"
        aria-label={label}
        title={label}
        className={cn(
          'flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground',
          className
        )}
      >
        <Compass className="size-5" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      data-tour="tour-launcher"
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className
      )}
    >
      <Compass className="size-4" strokeWidth={1.75} />
      {label}
    </button>
  );
}
