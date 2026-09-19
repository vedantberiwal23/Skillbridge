'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useI18n } from '@/i18n/provider';
import {
  INDIAN_LANGUAGES,
  isLocale,
  type Locale,
} from '@/i18n/config';
import KineticTextGrid from '@/components/visual/kinetic-text';

// 8 Primary languages commonly spoken across industrial manufacturing corridors
const PRIMARY_LANG_CODES = ['hi', 'en', 'mr', 'ta', 'te', 'kn', 'gu', 'bn'];

interface TradeOption {
  id: string;
  name: string;
  tagline: string;
  description: string;
  equipment: string;
  modulesCount: number;
  icon: string;
  category: string;
}

const TRADE_TRACKS: TradeOption[] = [
  {
    id: 'hydraulics',
    name: 'Hydraulics & Fluid Power',
    tagline: 'High-pressure fluid circuits, power units & valves',
    description: 'Learn hydraulic pump diagnosis, proportional valves, cylinder seals, and oil contamination protocols.',
    equipment: 'Rexroth HPU & Parker Valves',
    modulesCount: 14,
    icon: 'droplets',
    category: 'Fluid Mechanics',
  },
  {
    id: 'electrical',
    name: 'Electrical Systems & LOTO',
    tagline: '415V distribution, motor controls & plant safety',
    description: 'Master 3-phase circuits, relay panels, multimeter fault isolation, and life-critical Lockout/Tagout procedures.',
    equipment: 'Siemens Panels & Schneider Starters',
    modulesCount: 16,
    icon: 'zap',
    category: 'Industrial Electrical',
  },
  {
    id: 'maintenance',
    name: 'Machine Maintenance',
    tagline: 'Mechanical drives, bearings & vibration analysis',
    description: 'Daily visual inspections, bearing puller operations, shaft alignment tolerances, and preventive greasing schedules.',
    equipment: 'SKF Bearings & Lathe Spindles',
    modulesCount: 12,
    icon: 'wrench',
    category: 'Mechanical',
  },
  {
    id: 'pneumatics',
    name: 'Pneumatics & Compressed Air',
    tagline: 'FRL units, directional solenoids & air lines',
    description: 'Line pressure regulation, pneumatic cylinder timing, moisture trap servicing, and leak detection methods.',
    equipment: 'Festo Manifolds & SMC Regulators',
    modulesCount: 10,
    icon: 'wind',
    category: 'Pneumatics',
  },
  {
    id: 'safety',
    name: 'Plant Safety & Zero Hazard',
    tagline: 'Shop-floor PPE, hazard reporting & emergency stops',
    description: 'Mandatory plant compliance, emergency stops, chemical spill protocols, and daily hazard inspection rounds.',
    equipment: 'Plant Floor Safety Matrix',
    modulesCount: 8,
    icon: 'shield',
    category: 'Compliance',
  },
];

const ERGONOMIC_MODES = [
  {
    id: 'speech',
    title: 'Hands-Free Voice Tutor',
    badge: 'Recommended for Shop Floor',
    badgeColor: 'bg-blue-50 text-[#0B57D0] border-blue-200',
    description: 'Talk and listen naturally. Optimized for noise-canceling headsets or phone speakers while operating machinery.',
    details: ['Voice answers in your dialect', 'No typing or screen taps required', 'Works when wearing heavy industrial gloves'],
  },
  {
    id: 'text',
    title: 'Visual & Interactive SOPs',
    badge: 'Quiet & Bench Work',
    badgeColor: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    description: 'Step-by-step illustrated checklists, annotated equipment schematics, and interactive 3D component diagrams.',
    details: ['High-contrast text for shop lighting', 'Annotated hydraulic/electrical schematics', 'Printable shift checklists'],
  },
  {
    id: 'hybrid',
    title: 'Hybrid (Voice + Visual)',
    badge: 'Comprehensive',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Hear spoken explanations while your screen highlights the exact physical component and gauge reading in real time.',
    details: ['Audio guidance synchronized with diagrams', 'Interactive gauge & valve callouts', 'Fastest path to competency certification'],
  },
];

const SKILL_TIERS = [
  {
    id: 'Level 1',
    tier: 'Tier 01',
    title: 'Induction / New Plant Hire',
    duration: 'First 90 Days',
    focus: 'Daily visual check, PPE compliance, safe machine startup & basic fault recognition.',
    badge: 'Standard Onboarding',
  },
  {
    id: 'Level 2',
    tier: 'Tier 02',
    title: 'Certified Plant Technician',
    duration: '6+ Months Experience',
    focus: 'Preventive component replacement, gauge calibration, routine fluid flushing & SOP logging.',
    badge: 'Most Popular',
  },
  {
    id: 'Level 3',
    tier: 'Tier 03',
    title: 'Senior Specialist / Shift Lead',
    duration: 'Multi-Year Experience',
    focus: 'Complex root-cause fault diagnosis, major overhauls, emergency shutdowns & apprentice mentoring.',
    badge: 'Advanced Track',
  },
];

export default function OnboardingPage() {
  const { locale, setLocale } = useI18n();
  const router = useRouter();

  const [step, setStep] = useState<number>(1);
  const [selectedLang, setSelectedLang] = useState<string>(locale);
  const [showAllLangs, setShowAllLangs] = useState<boolean>(false);
  const [langSearch, setLangSearch] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<string>('speech');
  const [selectedTrade, setSelectedTrade] = useState<TradeOption>(TRADE_TRACKS[0]);
  const [selectedTier, setSelectedTier] = useState<string>('Level 1');
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [synthesisMessage, setSynthesisMessage] = useState<string>('Calibrating training roadmap...');

  // Set dev role cookie to ensure safe client routing
  useEffect(() => {
    document.cookie = 'dev_role=worker; path=/; max-age=86400';
  }, []);

  const totalSteps = 4;

  const currentLang =
    INDIAN_LANGUAGES.find((l) => l.code === selectedLang) ||
    INDIAN_LANGUAGES.find((l) => l.code === 'en') ||
    INDIAN_LANGUAGES[0];

  const handleNext = () => {
    if (step < totalSteps) {
      setStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Final step: synthesize and route to /plan
      setIsSynthesizing(true);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('sb_worker_trade_id', selectedTrade.id);
          localStorage.setItem('sb_worker_trade', selectedTrade.name);
          localStorage.setItem('sb_worker_level', selectedTier);
          localStorage.setItem('sb_worker_lang', selectedLang);
          localStorage.setItem('sb_worker_mode', selectedMode);
        } catch {
          // ignore localStorage quota errors
        }
      }

      setTimeout(() => {
        setSynthesisMessage(`Translating ${selectedTrade.name} SOPs into ${currentLang.native}...`);
      }, 700);

      setTimeout(() => {
        setSynthesisMessage('Activating voice tutor engine...');
      }, 1400);

      setTimeout(() => {
        router.push('/plan');
      }, 2100);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const filteredLanguages = INDIAN_LANGUAGES.filter(
    (l) =>
      l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
      l.native.toLowerCase().includes(langSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen w-full overflow-hidden bg-[#faf8f4]">
      {/* =========================================================
         LEFT BRAND CANVAS: Originkit Appear Text (KineticTextGrid)
         Desktop only (lg:block), replacing the old ASCII globe
         ========================================================= */}
      <div className="hidden lg:flex w-5/12 flex-col justify-between relative overflow-hidden bg-[#0c1017] text-white shrink-0 select-none border-r border-neutral-800/80">
        {/* Top brand header */}
        <div className="relative z-10 p-8 flex items-center justify-between">
          <Link href="/welcome" className="inline-flex items-center gap-2.5 group">
            <span className="size-2.5 rounded-full bg-[#0B57D0] shadow-sm shadow-blue-500/50" />
            <span className="text-lg font-bold tracking-tight text-white">
              SkillBridge
            </span>
          </Link>

          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-mono uppercase tracking-widest text-neutral-300 border border-white/10">
            Induction OS &bull; 2026
          </span>
        </div>

        {/* Center: Originkit Appear Text animation */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <KineticTextGrid
            text="SKILLBRIDGE"
            textColor="#ffffff"
            backgroundColor="transparent"
            rowCount={5}
            repeatCount={5}
            rowGap={18}
            wordGap={26}
            horizontalShiftPx={75}
            zoomScalePct={112}
            font={{
              fontFamily: 'inherit',
              fontWeight: 800,
              fontSize: 44,
              letterSpacing: '-0.02em',
            }}
          />
        </div>

        {/* Subtle vignette scrims so top and bottom text are legible */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0c1017] to-transparent z-5" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#0c1017] via-[#0c1017]/80 to-transparent z-5" />

        {/* Bottom context and live onboarding status */}
        <div className="relative z-10 p-8 space-y-4">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-white">Bharat Precision Engineering &bull; Unit #2</span>
          </div>

          <p className="text-xs leading-relaxed text-neutral-400 max-w-sm">
            Vocational induction grounded directly in your plant&rsquo;s machinery, SOPs, and safety protocols — spoken in your native tongue.
          </p>

          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-neutral-500">
            <span>TRACK: {selectedTrade.category.toUpperCase()}</span>
            <span>DIALECT: {currentLang.native}</span>
          </div>
        </div>
      </div>

      {/* =========================================================
         RIGHT CONTENT CANVAS: Clean, spacious onboarding wizard
         ========================================================= */}
      <div className="flex flex-1 flex-col justify-between overflow-y-auto bg-[#faf8f4] text-neutral-900">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-20 w-full border-b border-neutral-200/80 bg-white/95 backdrop-blur-md px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Worker Induction
            </span>
            <span className="text-neutral-300">&bull;</span>
            <span className="text-xs font-bold text-[#0B57D0]">
              Step {step} of {totalSteps}
            </span>
          </div>

          {/* Stepper Dots */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-7 bg-[#0B57D0]'
                    : s < step
                    ? 'w-3 bg-emerald-600'
                    : 'w-2 bg-neutral-200'
                }`}
              />
            ))}
          </div>
        </header>

        {/* Wizard Card Body */}
        <main className="flex-1 px-4 sm:px-8 py-8 sm:py-12 flex items-center justify-center">
          <div className="w-full max-w-2xl">
            {isSynthesizing ? (
              <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm">
                <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-[#0B57D0]/10 text-[#0B57D0]">
                  <svg className="size-7 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-neutral-900">
                  Calibrating Your Training Roadmap
                </h2>
                <p className="mt-2 text-sm text-neutral-500 font-medium">
                  {synthesisMessage}
                </p>

                <div className="mt-8 mx-auto max-w-md rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-left text-xs text-neutral-600 space-y-1.5">
                  <div className="flex justify-between py-0.5">
                    <span className="text-neutral-400">Department:</span>
                    <span className="font-semibold text-neutral-800">{selectedTrade.name}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-neutral-400">Instruction Dialect:</span>
                    <span className="font-semibold text-neutral-800">{currentLang.native} ({currentLang.name})</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-neutral-400">Ergonomics:</span>
                    <span className="font-semibold text-neutral-800">
                      {selectedMode === 'speech' ? 'Hands-Free Voice Tutor' : selectedMode === 'text' ? 'Visual Diagrams' : 'Hybrid Voice + Visual'}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-neutral-400">Tier:</span>
                    <span className="font-semibold text-neutral-800">{selectedTier}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 sm:p-9 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
                {/* ===================================================
                   STEP 1: LANGUAGE PREFERENCE
                   =================================================== */}
                {step === 1 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0B57D0]">
                      <span>Step 01</span>
                      <span>&bull;</span>
                      <span>Vernacular Engine</span>
                    </div>

                    <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
                      Which language do you speak best on the floor?
                    </h1>
                    <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                      All machine procedures, safety warnings, and AI voice tutoring will speak in your native dialect. Technical terms remain in English.
                    </p>

                    {/* Primary 8 languages grid */}
                    <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {INDIAN_LANGUAGES.filter((l) => PRIMARY_LANG_CODES.includes(l.code)).map((lang) => {
                        const isSelected = selectedLang === lang.code;
                        return (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={() => {
                              setSelectedLang(lang.code);
                              if (isLocale(lang.code)) setLocale(lang.code as Locale);
                            }}
                            className={`relative flex flex-col justify-between rounded-xl p-3.5 text-left transition-all duration-150 cursor-pointer min-h-[100px] ${
                              isSelected
                                ? 'border-2 border-[#0B57D0] bg-[#0B57D0]/5 shadow-sm'
                                : 'border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/70'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <span className={`text-2xl font-bold ${isSelected ? 'text-[#0B57D0]' : 'text-neutral-800'}`}>
                                {lang.glyph}
                              </span>
                              {isSelected && (
                                <span className="flex size-4.5 items-center justify-center rounded-full bg-[#0B57D0] text-[9px] font-bold text-white">
                                  ✓
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-900">{lang.native}</p>
                              <p className="text-[11px] text-neutral-500">{lang.name}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Regional Dialects Expandable Section */}
                    <div className="mt-6 rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-3.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-neutral-800">
                            Need another regional language?
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            SkillBridge supports all 26 official Indian regional languages.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAllLangs(!showAllLangs)}
                          className="text-xs font-semibold text-[#0B57D0] hover:underline"
                        >
                          {showAllLangs ? 'Collapse list ▲' : 'View all 26 ▼'}
                        </button>
                      </div>

                      {showAllLangs && (
                        <div className="mt-3 pt-3 border-t border-neutral-200">
                          <input
                            type="text"
                            value={langSearch}
                            onChange={(e) => setLangSearch(e.target.value)}
                            placeholder="Search language or state..."
                            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-[#0B57D0]"
                          />
                          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                            {filteredLanguages.map((l) => (
                              <button
                                key={l.code}
                                type="button"
                                onClick={() => {
                                  setSelectedLang(l.code);
                                  if (isLocale(l.code)) setLocale(l.code as Locale);
                                }}
                                className={`rounded-lg px-2.5 py-1 text-left text-xs transition-colors flex items-center justify-between ${
                                  selectedLang === l.code
                                    ? 'bg-[#0B57D0] text-white font-semibold'
                                    : 'hover:bg-white text-neutral-700'
                                }`}
                              >
                                <span>{l.native}</span>
                                <span className="text-[10px] opacity-75 font-mono">{l.glyph}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ===================================================
                   STEP 2: ERGONOMIC FORMAT (Voice vs Visual)
                   =================================================== */}
                {step === 2 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0B57D0]">
                      <span>Step 02</span>
                      <span>&bull;</span>
                      <span>Shop-Floor Ergonomics</span>
                    </div>

                    <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
                      How will you be taking your training?
                    </h1>
                    <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                      Select the interface best suited for your working environment and PPE requirements.
                    </p>

                    <div className="mt-7 space-y-3.5">
                      {ERGONOMIC_MODES.map((m) => {
                        const isSelected = selectedMode === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedMode(m.id)}
                            className={`w-full rounded-xl p-4 sm:p-5 text-left transition-all duration-150 cursor-pointer flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                              isSelected
                                ? 'border-2 border-[#0B57D0] bg-[#0B57D0]/5 shadow-sm'
                                : 'border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/60'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-bold text-neutral-900">
                                  {m.title}
                                </h3>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${m.badgeColor}`}>
                                  {m.badge}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-neutral-600 leading-relaxed">
                                {m.description}
                              </p>

                              <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                                {m.details.map((detail, idx) => (
                                  <li key={idx} className="flex items-center gap-1.5">
                                    <span className="size-1 rounded-full bg-[#0B57D0]" />
                                    <span>{detail}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="flex items-center sm:self-center">
                              <div className={`flex size-5.5 items-center justify-center rounded-full border transition-all ${
                                isSelected
                                  ? 'border-[#0B57D0] bg-[#0B57D0] text-white'
                                  : 'border-neutral-300 bg-white'
                              }`}>
                                {isSelected && <span className="text-[11px] font-bold">✓</span>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ===================================================
                   STEP 3: TRADE SPECIALIZATION
                   =================================================== */}
                {step === 3 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0B57D0]">
                      <span>Step 03</span>
                      <span>&bull;</span>
                      <span>Machinery & Trade Track</span>
                    </div>

                    <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
                      Select your assigned plant department
                    </h1>
                    <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                      Digital twin schematics and induction checklists will be calibrated directly to your department&rsquo;s machinery.
                    </p>

                    <div className="mt-7 space-y-2.5">
                      {TRADE_TRACKS.map((trade) => {
                        const isSelected = selectedTrade.id === trade.id;
                        return (
                          <button
                            key={trade.id}
                            type="button"
                            onClick={() => setSelectedTrade(trade)}
                            className={`w-full rounded-xl p-3.5 sm:p-4 text-left transition-all duration-150 cursor-pointer flex items-center justify-between gap-4 ${
                              isSelected
                                ? 'border-2 border-[#0B57D0] bg-[#0B57D0]/5 shadow-sm'
                                : 'border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/60'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                                  {trade.category}
                                </span>
                                <span className="text-neutral-300">&bull;</span>
                                <span className="text-[11px] font-medium text-neutral-600">
                                  {trade.modulesCount} Verified SOPs
                                </span>
                              </div>

                              <h3 className="mt-0.5 text-sm sm:text-base font-bold text-neutral-900">
                                {trade.name}
                              </h3>
                              <p className="text-xs text-neutral-500">
                                {trade.tagline}
                              </p>

                              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
                                <span className="font-semibold text-neutral-700">Digital Twin:</span>
                                <span className="font-mono text-neutral-600">{trade.equipment}</span>
                              </div>
                            </div>

                            <div className={`flex size-5.5 shrink-0 items-center justify-center rounded-full border transition-all ${
                              isSelected
                                ? 'border-[#0B57D0] bg-[#0B57D0] text-white'
                                : 'border-neutral-300 bg-white'
                            }`}>
                              {isSelected && <span className="text-[11px] font-bold">✓</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ===================================================
                   STEP 4: EXPERIENCE TIER
                   =================================================== */}
                {step === 4 && (
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0B57D0]">
                      <span>Step 04</span>
                      <span>&bull;</span>
                      <span>Experience Calibration</span>
                    </div>

                    <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
                      What is your experience level?
                    </h1>
                    <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                      We adapt the difficulty and pace of your digital training milestones based on your background.
                    </p>

                    <div className="mt-7 space-y-3.5">
                      {SKILL_TIERS.map((tier) => {
                        const isSelected = selectedTier === tier.id;
                        return (
                          <button
                            key={tier.id}
                            type="button"
                            onClick={() => setSelectedTier(tier.id)}
                            className={`w-full rounded-xl p-4 sm:p-5 text-left transition-all duration-150 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isSelected
                                ? 'border-2 border-[#0B57D0] bg-[#0B57D0]/5 shadow-sm'
                                : 'border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/60'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-[#0B57D0]">
                                  {tier.tier}
                                </span>
                                <span className="text-neutral-300">&bull;</span>
                                <span className="text-xs font-medium text-neutral-500">
                                  {tier.duration}
                                </span>
                              </div>

                              <h3 className="mt-0.5 text-base font-bold text-neutral-900">
                                {tier.title}
                              </h3>
                              <p className="mt-1 text-xs text-neutral-600 leading-relaxed">
                                {tier.focus}
                              </p>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3">
                              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700">
                                {tier.badge}
                              </span>
                              <div className={`flex size-5.5 shrink-0 items-center justify-center rounded-full border transition-all ${
                                isSelected
                                  ? 'border-[#0B57D0] bg-[#0B57D0] text-white'
                                  : 'border-neutral-300 bg-white'
                              }`}>
                                {isSelected && <span className="text-[11px] font-bold">✓</span>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ===================================================
                   WIZARD NAVIGATION FOOTER (Back / Continue)
                   =================================================== */}
                <div className="mt-9 pt-5 border-t border-neutral-100 flex items-center justify-between gap-4">
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                    >
                      &larr; Back
                    </button>
                  ) : (
                    <Link
                      href="/welcome"
                      className="text-xs font-medium text-neutral-500 hover:text-neutral-800 transition-colors"
                    >
                      Return to Welcome
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={handleNext}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0B57D0] px-6 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-[#094bb8] active:translate-y-0.5 transition-all ml-auto"
                  >
                    <span>{step === totalSteps ? 'Generate Training Plan' : 'Continue'}</span>
                    <span>&rarr;</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Subtle Bottom Footer */}
        <footer className="w-full border-t border-neutral-200/60 bg-white/70 py-2.5 text-center text-xs text-neutral-500 px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px]">
            <span>Bharat Precision Engineering &bull; Industrial Skill Induction</span>
            <span>SkillBridge &copy; 2026</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
