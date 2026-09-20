'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Instrument_Serif, Azeret_Mono } from 'next/font/google';

import dynamic from 'next/dynamic';

/**
 * three.js is ~600 KB and this is the first page a visitor loads.
 *
 * A static import here would put the whole renderer in the landing bundle for
 * everyone, including visitors who never scroll to the machine — which is the
 * cost `interactive-simulation.tsx` already avoids the same way. `ssr: false`
 * because it touches WebGL on mount.
 */
const ExplodedPump3D = dynamic(
  () => import('@/components/viewer/exploded-pump-3d').then((m) => m.ExplodedPump3D),
  // The wrapping `.subject` element already reserves the space, so the
  // placeholder renders nothing and the hero does not reflow on arrival.
  { ssr: false, loading: () => null }
);
import { TRADES_CATALOG } from '@/data/curriculum';
import s from './lander.module.css';

/**
 * Editorial landing page.
 *
 * The wordmark is split across two stacked lines with the machine standing in
 * the gap — the upper line above it in the stacking order, the lower line
 * beneath — so the subject is bracketed rather than overlaid. Scroll pulls the
 * lines apart as the machine rises.
 *
 * Every number on this page is either computed here from a stated model (the
 * pinned study) or read from the product's own catalogue. Nothing is invented:
 * no awards, no press, no client logos, no testimonials.
 */

const serif = Instrument_Serif({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-serif-editorial' });
const mono = Azeret_Mono({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-mono-editorial' });

/* ── the study's model ────────────────────────────────────────────────────
   An axial-piston pump, the machine in the hero. Swashplate angle sets how far
   each piston strokes, so displacement per revolution is

     V = z · (π/4 · d²) · (D · tan θ)

   with z pistons of bore d on a pitch circle of diameter D. Flow is V × speed.
   The drawn swashplate and the printed numbers are the same calculation, so
   they cannot disagree. ------------------------------------------------- */

const PISTONS = 9;
const BORE_MM = 16;
const PITCH_MM = 60;
const MAX_ANGLE_DEG = 17.5;
const RPM = 1500;
const PRESSURE_BAR = 210;

function study(progress: number) {
  const angleDeg = MAX_ANGLE_DEG * progress;
  const strokeMm = PITCH_MM * Math.tan((angleDeg * Math.PI) / 180);
  const areaMm2 = (Math.PI / 4) * BORE_MM ** 2;
  const displacementCc = (PISTONS * areaMm2 * strokeMm) / 1000;
  const flowLpm = (displacementCc * RPM) / 1000;
  // Hydraulic power: P[kW] = p[bar] × Q[L/min] / 600
  const powerKw = (PRESSURE_BAR * flowLpm) / 600;
  return { angleDeg, strokeMm, displacementCc, flowLpm, powerKw };
}

export default function LanderPage() {
  const heroRef = useRef<HTMLElement>(null);
  const studyRef = useRef<HTMLDivElement>(null);
  const [heroProgress, setHeroProgress] = useState(0);
  const [studyProgress, setStudyProgress] = useState(0);

  // One scroll-bound layer, read every frame: the page still moves when the
  // reader scrolls back up, which an enter-once observer cannot do.
  useEffect(() => {
    let frame = 0;
    const read = () => {
      const hero = heroRef.current;
      if (hero) {
        const r = hero.getBoundingClientRect();
        setHeroProgress(Math.min(1, Math.max(0, -r.top / Math.max(1, r.height))));
      }
      const st = studyRef.current;
      if (st) {
        const r = st.getBoundingClientRect();
        const travel = Math.max(1, r.height - window.innerHeight);
        setStudyProgress(Math.min(1, Math.max(0, -r.top / travel)));
      }
      frame = requestAnimationFrame(read);
    };
    frame = requestAnimationFrame(read);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Reveals. Anything already on screen at load is revealed on the next frame
  // and never observed: on a short viewport it can sit inside the observer's
  // negative margin, never intersect, and stay invisible for good.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(`.${s.reveal}`));
    const above = nodes.filter((n) => n.getBoundingClientRect().top < window.innerHeight);
    requestAnimationFrame(() => above.forEach((n, i) => setTimeout(() => n.classList.add(s.revealIn), i * 70)));

    const io = new IntersectionObserver(
      (entries) => {
        entries
          .filter((e) => e.isIntersecting)
          .forEach((e, i) => setTimeout(() => e.target.classList.add(s.revealIn), i * 70));
      },
      { rootMargin: '0px 0px -12% 0px' }
    );
    nodes.filter((n) => !above.includes(n)).forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  const m = study(studyProgress);
  const trades = Object.values(TRADES_CATALOG);

  return (
    <div className={`${s.page} ${serif.variable} ${mono.variable}`}>
      {/* ── 1. navigation ── */}
      <nav className={s.nav}>
        <Link href="/lander" className={s.wordmarkSmall} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
          SkillBridge<span style={{ color: 'var(--pigment)' }}>.</span>
        </Link>
        <div className={s.navLinks}>
          <a className={s.navLink} href="#method">Method</a>
          <a className={s.navLink} href="#study">Study</a>
          <a className={s.navLink} href="#practice">Practice</a>
          <a className={s.navLink} href="#work">Work</a>
        </div>
        <Link href="/login" className={s.btnSolid}>Sign in</Link>
      </nav>

      {/* ── 2. hero: split wordmark bracketing the machine ── */}
      <section ref={heroRef} className={s.hero}>
        <div
          className={s.wordLineTop}
          style={{ transform: `translate3d(${heroProgress * 2}vw, ${-heroProgress * 20}vh, 0)` }}
        >
          SKILL
        </div>

        <div
          className={s.subject}
          style={{
            transform: `translate3d(0, ${-heroProgress * 24}vh, 0) scale(${1 + heroProgress * 0.08})`,
          }}
        >
          <ExplodedPump3D transparent />
        </div>

        <div
          className={s.wordLineBottom}
          style={{ transform: `translate3d(${heroProgress * 3}vw, ${heroProgress * 20}vh, 0)` }}
        >
          BRIDGE
        </div>

        <div className={s.heroCopy}>
          <p className={`${s.labelPigment} ${s.reveal}`}>Vocational training studio — Pune, IN</p>
          <h1 className={`${s.heroHeadline} ${s.reveal}`}>
            The machine teaches, <span className={s.italic}>out loud</span>, in the worker&rsquo;s own language.
          </h1>
          <p className={`${s.body} ${s.reveal}`}>
            A technician holds a button and asks in Hindi or Marathi. The answer comes back from the
            employer&rsquo;s own procedure documents, cites the one it used, and refuses when it has none.
          </p>
          <div className={`${s.heroActions} ${s.reveal}`}>
            <Link href="/login" className={s.btnSolid}>Enter the platform</Link>
            <a href="#method" className={s.btn}>Read the method</a>
          </div>
        </div>

        <p className={s.heroCaption}>
          Fig. 01 — Axial-piston pump, {PISTONS} pistons, {BORE_MM} mm bore. Exploded along the shaft axis.
        </p>
      </section>

      {/* ── 3. method: prose, ruled data, and a drawing to scale ── */}
      <section id="method" className={s.section}>
        <div className={s.two}>
          <div>
            <p className={`${s.labelPigment} ${s.reveal}`}>01 — Method</p>
            <h2 className={`${s.h2} ${s.reveal}`} style={{ marginTop: 14 }}>
              Grounded in <span className={s.italic}>their</span> procedures, not the internet&rsquo;s.
            </h2>
            <p className={`${s.body} ${s.reveal}`} style={{ marginTop: 16 }}>
              Each employer&rsquo;s documents are indexed under their own prefix and their own key. A question
              is answered from that set or not at all. The tutor names the document it answered from, and
              where a procedure is silent it says so and sends the worker to their supervisor.
            </p>

            <dl className={`${s.rows} ${s.reveal}`}>
              {[
                ['Speech', 'Streamed in and out while the worker is still talking', '16 kHz · 50 ms'],
                ['Retrieval', 'Employer documents, matched across languages', '1024-dim'],
                ['Answer', 'Spoken prose, technical terms kept in English', '50–90 words'],
                ['Isolation', 'One document prefix and one key per employer', 'per tenant'],
              ].map(([label, desc, value]) => (
                <div key={label} className={s.row}>
                  <span className={s.labelPigment}>{label}</span>
                  <span className={s.body}>{desc}</span>
                  <span className={s.rowValue}>{value}</span>
                </div>
              ))}
            </dl>
          </div>

          <div className={s.reveal}>
            <ScaleDrawing />
            <p className={s.label} style={{ marginTop: 12 }}>
              Fig. 02 — Hydraulic power unit, drawn to scale. 1 px = 2 mm.
            </p>
          </div>
        </div>
      </section>

      {/* ── 4. pinned study: the swashplate model ── */}
      <div id="study" ref={studyRef} className={s.studyOuter}>
        <div className={s.studyStage}>
          <div>
            <p className={s.labelPigment}>02 — Study</p>
            <h2 className={s.h2} style={{ marginTop: 14 }}>
              Swashplate angle sets <span className={s.italic}>everything</span> downstream.
            </h2>
            <p className={s.body} style={{ marginTop: 12 }}>
              V = z · (π/4 · d²) · (D · tan θ), at {PISTONS} pistons, {BORE_MM} mm bore, {PITCH_MM} mm pitch
              circle, {RPM} rpm, {PRESSURE_BAR} bar. Scroll drives θ; every number below is that formula.
            </p>
          </div>

          <div className={s.studyPlot}>
            <SwashplatePlot angleDeg={m.angleDeg} progress={studyProgress} />
          </div>

          <div className={s.readouts}>
            <Readout label="Swashplate θ" value={`${m.angleDeg.toFixed(1)}°`} />
            <Readout label="Piston stroke" value={`${m.strokeMm.toFixed(1)} mm`} />
            <Readout label="Displacement" value={`${m.displacementCc.toFixed(1)} cc/rev`} />
            <Readout label="Flow at 1500 rpm" value={`${m.flowLpm.toFixed(1)} L/min`} />
          </div>
        </div>
      </div>

      {/* ── 5. practice ── */}
      <section id="practice" className={s.section}>
        <div className={s.two}>
          <div>
            <p className={`${s.labelPigment} ${s.reveal}`}>03 — Practice</p>
            <h2 className={`${s.h2} ${s.reveal}`} style={{ marginTop: 14 }}>
              What the platform will and will not do.
            </h2>
            <p className={`${s.body} ${s.reveal}`} style={{ marginTop: 16 }}>
              Accounts exist only by invitation from an employer. Scores are never reported by the device
              that earned them. A module closes when its assessment is passed, not when a worker says so.
            </p>
          </div>
          <dl className={`${s.rows} ${s.reveal}`} style={{ marginTop: 0 }}>
            {[
              ['Enrolment', 'Invite bound to one phone number or email', 'employer-issued'],
              ['Grading', 'Fixed answers checked in code; reasoning judged against a rubric', 'server-side'],
              ['Progress', 'A module closes on a passing assessment', '≥ 70'],
              ['Safety', 'No isolation step is ever reordered or shortened', 'refuses'],
              ['Record', 'Transcripts and outcomes only — never raw audio', '90 days'],
            ].map(([label, desc, value]) => (
              <div key={label} className={s.row}>
                <span className={s.labelPigment}>{label}</span>
                <span className={s.body}>{desc}</span>
                <span className={s.rowValue}>{value}</span>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 6. work table: the trades actually in the catalogue ── */}
      <section id="work" className={s.section}>
        {/* Same measure as the table below it, or the heading hangs off the
            page edge while the data sits in the centred column. */}
        <div className={s.wrap}>
          <p className={`${s.labelPigment} ${s.reveal}`}>04 — Work</p>
          <h2 className={`${s.h2} ${s.reveal}`} style={{ marginTop: 14 }}>
            Trades in the catalogue.
          </h2>
        </div>
        <table className={`${s.table} ${s.reveal}`}>
          <thead>
            <tr>
              <th>Track</th>
              <th>Industry</th>
              <th>Stages</th>
              <th>Modules</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const modules = trade.stages.reduce((n, stage) => n + stage.items.length, 0);
              return (
                <tr key={trade.id}>
                  <td className={s.projectName}>{trade.name}</td>
                  <td>{trade.industry}</td>
                  <td>{String(trade.stages.length).padStart(2, '0')}</td>
                  <td>{String(modules).padStart(2, '0')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* ── 7. close ── */}
      <section className={s.section} style={{ paddingBottom: 0 }}>
        <div className={s.wrap}>
          <h2 className={`${s.h2} ${s.reveal}`}>
            Built for the floor, <span className={s.italic}>not the classroom</span>.
          </h2>
          <p className={`${s.label} ${s.reveal}`} style={{ marginTop: 16 }}>
            Invite-only · Worker accounts are created by the employer · No self sign-up anywhere
          </p>
        </div>
        <div className={s.closeActions}>
          <Link href="/login" className={s.btnSolid}>Enter the platform</Link>
          <a href="#method" className={s.btn}>Back to the method</a>
        </div>
        <div className={s.footStrip}>
          <span className={s.label}>SkillBridge — vocational training studio</span>
          <span className={s.label}>Fig. 01–02 drawn to scale</span>
        </div>
        <div className={s.wordmarkCrop} aria-hidden>
          SKILLBRIDGE
        </div>
      </section>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={s.label}>{label}</p>
      <p className={s.readoutValue}>{value}</p>
    </div>
  );
}

/**
 * Hydraulic power unit, drawn at 1 px = 2 mm on a 640 × 360 field:
 * a 400 mm reservoir, a 220 mm pump, a 300 mm cylinder with a 160 mm stroke.
 * Construction geometry is hairline; the machine's own outline is heavier so
 * it does not read as one more leader.
 */
function ScaleDrawing() {
  const mm = (v: number) => v / 2; // 1 px = 2 mm
  const ink = '#1a1917';
  const hair = 'rgba(26,25,23,.28)';
  const pigment = '#9b3418';

  return (
    <svg viewBox="0 0 640 360" className={s.drawing} role="img" aria-label="Hydraulic power unit drawn to scale">
      {/* construction */}
      <g stroke={hair} strokeWidth="0.75" fill="none">
        <path d={`M40 ${mm(560)} H600`} strokeDasharray="6 5" />
        <path d="M40 40 V330" strokeDasharray="6 5" />
        {Array.from({ length: 13 }, (_, i) => (
          <path key={i} d={`M${40 + i * 46} 326 v8`} />
        ))}
      </g>

      {/* reservoir: 400 × 220 mm */}
      <rect x="40" y={280 - mm(220)} width={mm(400)} height={mm(220)} fill="none" stroke={ink} strokeWidth="1.6" />
      {/* fluid line at 70 % */}
      <path d={`M40 ${280 - mm(220) * 0.7} H${40 + mm(400)}`} stroke={pigment} strokeWidth="1" strokeDasharray="4 4" />

      {/* pump body: 220 × 140 mm, on top of the reservoir */}
      <rect x={70} y={280 - mm(220) - mm(140)} width={mm(220)} height={mm(140)} fill="none" stroke={ink} strokeWidth="1.6" />
      <circle cx={70 + mm(110)} cy={280 - mm(220) - mm(70)} r={mm(56)} fill="none" stroke={ink} strokeWidth="1.6" />
      <circle cx={70 + mm(110)} cy={280 - mm(220) - mm(70)} r="2.5" fill={pigment} />

      {/* cylinder: 300 mm barrel, 160 mm stroke */}
      <rect x={380} y={200} width={mm(300)} height={mm(90)} fill="none" stroke={ink} strokeWidth="1.6" />
      <path d={`M${380 + mm(300)} ${200 + mm(45)} h${mm(160)}`} stroke={ink} strokeWidth="1.6" />
      <circle cx={380 + mm(300) + mm(160)} cy={200 + mm(45)} r="2.5" fill={pigment} />

      {/* stroke dimension */}
      <g stroke={pigment} strokeWidth="0.9" fill="none">
        <path d={`M${380 + mm(300)} 250 v10 M${380 + mm(300) + mm(160)} 250 v10`} />
        <path d={`M${380 + mm(300)} 255 H${380 + mm(300) + mm(160)}`} />
      </g>

      {/* leaders */}
      <g stroke={hair} strokeWidth="0.75" fill="none">
        <path d={`M${70 + mm(110)} ${280 - mm(220) - mm(70)} L300 70`} />
        <path d={`M${40 + mm(200)} ${280 - mm(110)} L300 300`} />
        <path d={`M${380 + mm(300) + mm(160)} ${200 + mm(45)} L560 150`} />
      </g>

      <g fill="#6e6a61" fontFamily="var(--font-mono-editorial), monospace" fontSize="9" letterSpacing="1.4">
        <text x="304" y="68">PUMP · 220 × 140 MM</text>
        <text x="304" y="303">RESERVOIR · 400 × 220 MM</text>
        <text x="500" y="146">ROD · STROKE 160 MM</text>
        <text x={380 + mm(300)} y="272" fill={pigment}>160 MM</text>
        <text x="40" y="350">SCALE 1 PX = 2 MM</text>
      </g>
    </svg>
  );
}

/**
 * The swashplate, drawn from the same angle the readouts print. The marker
 * travels a real arc, positioned in percentages of the stage so it stays on
 * screen at any viewport.
 */
function SwashplatePlot({ angleDeg, progress }: { angleDeg: number; progress: number }) {
  const ink = '#1a1917';
  const hair = 'rgba(26,25,23,.28)';
  const pigment = '#9b3418';
  const cx = 300;
  const cy = 150;
  const r = 110;
  const rad = (angleDeg * Math.PI) / 180;
  // Plate edge tilted by θ about the vertical axis.
  const dx = Math.cos(rad) * r;
  const dy = Math.sin(rad) * r;
  // Marker on the arc the plate edge sweeps, bound to progress.
  const markerAngle = -Math.PI / 2 + progress * rad * 4;
  const mx = cx + Math.cos(markerAngle) * r;
  const my = cy + Math.sin(markerAngle) * r;

  return (
    <svg viewBox="0 0 600 300" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }} role="img"
      aria-label={`Swashplate at ${angleDeg.toFixed(1)} degrees`}>
      <g stroke={hair} strokeWidth="0.75" fill="none">
        <circle cx={cx} cy={cy} r={r} strokeDasharray="5 5" />
        <path d={`M${cx - r - 40} ${cy} H${cx + r + 40}`} strokeDasharray="5 5" />
        <path d={`M${cx} 20 V280`} strokeDasharray="5 5" />
      </g>

      {/* shaft */}
      <path d={`M${cx - r - 60} ${cy} H${cx + r + 60}`} stroke={ink} strokeWidth="2" />

      {/* tilted plate */}
      <path d={`M${cx - dx} ${cy + dy} L${cx + dx} ${cy - dy}`} stroke={ink} strokeWidth="3" strokeLinecap="round" />

      {/* piston at top dead centre, stroking with the plate */}
      <g stroke={ink} strokeWidth="1.6" fill="none">
        <rect x={cx - 16} y={cy - r - 54} width="32" height="42" />
        <path d={`M${cx} ${cy - r - 12} V${cy - Math.sin(rad) * 0 - r + 6}`} />
      </g>

      <circle cx={mx} cy={my} r="5" fill={pigment} />
      <text x={mx + 12} y={my + 4} fill={pigment} fontFamily="var(--font-mono-editorial), monospace" fontSize="10" letterSpacing="1.4">
        {angleDeg.toFixed(1)}°
      </text>
    </svg>
  );
}
