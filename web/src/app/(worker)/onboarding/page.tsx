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

const PROFESSIONS = [
  {
    id: 'hydraulics',
    title: 'HYDRAULICS MAINTENANCE TECHNICIAN',
    subtitle: 'Power units, pumps, relief valves & fluid pressure',
    iconType: 'hydraulics',
    badge: 'Core Track',
  },
  {
    id: 'electrical',
    title: 'INDUSTRIAL ELECTRICAL TECHNICIAN',
    subtitle: '415V distribution panels, motor controls & LOTO safety',
    iconType: 'electrician',
    badge: 'Plant Safety',
  },
  {
    id: 'mobile',
    title: 'MOBILE EQUIPMENT TECHNICIAN',
    subtitle: 'Track drives, air brake boosters & sectional valves',
    iconType: 'mechanical',
    badge: 'Heavy Machinery',
  },
  {
    id: 'stationary',
    title: 'STATIONARY MACHINERY OPERATOR',
    subtitle: 'Continuous casters, hydraulic presses & cooling beds',
    iconType: 'operator',
    badge: 'Steel & Foundries',
  },
  {
    id: 'automation',
    title: 'AUTOMATION & PLC SPECIALIST',
    subtitle: 'Ladder logic, 24VDC I/O modules & network bus diagnostics',
    iconType: 'operator',
    badge: 'Robotics & Control',
  },
];

const SKILL_LEVELS = [
  {
    id: 'Level 1',
    title: 'LEVEL 1 &bull; FOUNDATION',
    subtitle: 'First 90 days induction, machine safety, inspection SOPs',
    badge: 'Induction Track',
  },
  {
    id: 'Level 2',
    title: 'LEVEL 2 &bull; CERTIFIED TECHNICIAN',
    subtitle: 'Routine maintenance, component swaps & pressure testing',
    badge: 'Core Track',
  },
  {
    id: 'Level 3',
    title: 'LEVEL 3 &bull; SPECIALIST',
    subtitle: 'Root-cause fault diagnostics, overhaul & shift mentoring',
    badge: 'Advanced',
  },
];

const CAROUSEL_SLIDES = [
  {
    badge: 'VOCATIONAL ONBOARDING',
    headline: 'A few clicks away from your shop-floor training.',
    tagline: 'Start your vocational onboarding in minutes. Safe, hands-free, multilingual.',
  },
  {
    badge: 'HANDS-FREE AUDIO TUTOR',
    headline: 'Ergonomics designed for hands holding tools.',
    tagline: 'Voice-first AI coaching allows technicians to ask SOP questions aloud while working on machines.',
  },
  {
    badge: '3D DIGITAL TWIN',
    headline: 'Interactive 3D models for plant machinery.',
    tagline: 'Tap components on the HPU-400 digital twin to inspect valves, pumps, and fluid paths.',
  },
  {
    badge: 'PLANT CERTIFICATION',
    headline: 'Standardized skills for Bharat Precision Engineering.',
    tagline: 'Verified competencies and step-by-step procedures authorized by plant supervisors.',
  },
];

function TradeIcon({ type }: { type: string }) {
  if (type === 'hydraulics') {
    return (
      <svg className="size-6 text-inherit" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    );
  }
  if (type === 'electrician') {
    return (
      <svg className="size-6 text-inherit" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    );
  }
  if (type === 'mechanical') {
    return (
      <svg className="size-6 text-inherit" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg className="size-6 text-inherit" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  );
}

export default function OnboardingPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [selectedLang, setSelectedLang] = useState<string>(locale);
  const [langSearch, setLangSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | 'north' | 'south' | 'west' | 'east'>('all');
  const [mode, setMode] = useState<'speech' | 'text'>('speech');
  const [tradeId, setTradeId] = useState('hydraulics');
  const [profession, setProfession] = useState('HYDRAULICS MAINTENANCE TECHNICIAN');
  const [skillLevel, setSkillLevel] = useState('Level 1');
  const [isGenerating, setIsGenerating] = useState(false);

  // Set dev_role=worker cookie so navigation into /plan is guaranteed
  useEffect(() => {
    document.cookie = 'dev_role=worker; path=/; max-age=86400';
  }, []);

  // Automatic scrolling feature for the left sidebar carousel (cycles every 4 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  const totalSteps = 4;

  const handleNext = () => {
    if (stepIndex < totalSteps - 1) {
      setStepIndex((i) => i + 1);
    } else {
      setIsGenerating(true);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('sb_worker_trade_id', tradeId);
          localStorage.setItem('sb_worker_trade', profession);
          localStorage.setItem('sb_worker_level', skillLevel);
          localStorage.setItem('sb_worker_lang', selectedLang);
          localStorage.setItem('sb_worker_mode', mode);
        } catch {
          // ignore storage errors
        }
      }
      setTimeout(() => {
        router.push('/plan');
      }, 1600);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    }
  };

  const activeSlide = CAROUSEL_SLIDES[slideIndex];

  return (
    <main className="flex min-h-screen w-full flex-col lg:flex-row bg-[#F8FAFC]">
      {/* =======================================================
         LEFT SIDEBAR: AUTO-SCROLLING VIBRANT BLUE CAROUSEL
         ======================================================= */}
      <div className="flex w-full flex-col justify-between bg-[#0B57D0] px-8 py-10 lg:w-[38%] lg:min-h-screen lg:px-14 lg:py-14 text-white select-none">
        {/* Brand Logo */}
        <div>
          <Link href="/welcome" className="inline-flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-white text-[#0B57D0] font-bold text-lg shadow-xs">
              S
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              SkillBridge
            </span>
          </Link>
        </div>

        {/* Dynamic Auto-Scrolling Carousel Content */}
        <div className="my-12 lg:my-0 max-w-md">
          {/* Slide Category Pill */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-xs border border-white/20">
            <span className="size-1.5 rounded-full bg-white animate-pulse" />
            {activeSlide.badge}
          </div>

          {/* Animated Headline & Tagline with smooth transition key */}
          <div key={slideIndex} className="animate-in fade-in slide-in-from-bottom-3 duration-500">
            <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.5rem] font-bold leading-[1.18] tracking-tight text-white min-h-[120px] sm:min-h-[140px] flex items-center">
              {activeSlide.headline}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-white/85 leading-relaxed font-normal min-h-[60px]">
              {activeSlide.tagline}
            </p>
          </div>

          {/* Interactive Stepper Dots with Auto-Scroll Progress Indicator */}
          <div className="mt-8 flex items-center gap-2.5">
            {CAROUSEL_SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to slide ${idx + 1}`}
                onClick={() => setSlideIndex(idx)}
                className={`relative h-2 rounded-full transition-all duration-500 overflow-hidden ${
                  slideIndex === idx
                    ? 'w-10 bg-white/40'
                    : 'w-2 bg-white/30 hover:bg-white/60'
                }`}
              >
                {slideIndex === idx ? (
                  <span
                    key={slideIndex}
                    className="absolute inset-0 bg-white animate-carousel-progress"
                  />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* Plant Status / Anchor Graphic */}
        <div className="pt-6 border-t border-white/15">
          <div className="flex items-center gap-3 text-xs text-white/80">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Bharat Precision Engineering &bull; Unit #2</span>
          </div>
          <p className="mt-1 text-[11px] text-white/55 font-mono">
            Auto-Sync &bull; Industrial Training Portal
          </p>
        </div>
      </div>

      {/* =======================================================
         RIGHT AREA: QUESTIONNAIRE STEPPER (Matches Reference)
         ======================================================= */}
      <div className="flex flex-1 flex-col justify-between px-6 py-10 sm:px-12 lg:px-20 lg:py-12 bg-[#F8FAFC]">
        {/* Top Header Utilities */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Step {stepIndex + 1} of {totalSteps}
          </span>

          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <span>Having troubles?</span>
            <Link href="/welcome" className="font-semibold text-[#0B57D0] hover:underline">
              Get Help
            </Link>
          </div>
        </div>

        {/* Questionnaire Core Container */}
        <div className="my-auto mx-auto w-full max-w-xl py-8">
          {!isGenerating ? (
            <>
              {/* ----------------------------------------------------
                 STEP 1: PAN-INDIA MULTILINGUAL SELECTION
                 ---------------------------------------------------- */}
              {stepIndex === 0 ? (
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {t('onboarding.language')}
                  </h2>
                  <p className="mt-2 text-sm sm:text-base text-slate-500">
                    Select your native language. AI voice tutoring and plant SOPs will adapt to your regional dialect.
                  </p>

                  {/* Search Input for Indian Languages */}
                  <div className="mt-6 relative">
                    <input
                      type="text"
                      value={langSearch}
                      onChange={(e) => {
                        setLangSearch(e.target.value);
                        if (e.target.value) setRegionFilter('all');
                      }}
                      placeholder="Search across all 26 Indian languages (e.g. Tamil, Bhojpuri, Gujarati, Odia)..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#0B57D0] focus:ring-1 focus:ring-[#0B57D0] shadow-2xs"
                    />
                    {langSearch ? (
                      <button
                        type="button"
                        onClick={() => setLangSearch('')}
                        className="absolute right-3.5 top-3.5 text-xs text-slate-400 hover:text-slate-600 font-medium"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  {/* Regional Filter Tabs */}
                  <div className="mt-3.5 flex flex-wrap gap-2 text-xs">
                    {(
                      [
                        ['all', 'All (26)'],
                        ['south', 'South (4)'],
                        ['west', 'West (5)'],
                        ['north', 'North (6)'],
                        ['east', 'East & Central (11)'],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setRegionFilter(val);
                          setLangSearch('');
                        }}
                        className={`rounded-lg px-3 py-1.5 font-medium transition-all ${
                          regionFilter === val && !langSearch
                            ? 'bg-[#0B57D0] text-white shadow-2xs font-semibold'
                            : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Scrollable Language List */}
                  <div className="mt-4 flex flex-col gap-3.5 max-h-[420px] overflow-y-auto pr-1.5 scrollbar-thin">
                    {INDIAN_LANGUAGES.filter((lang) => {
                      if (langSearch) {
                        const q = langSearch.toLowerCase();
                        return (
                          lang.name.toLowerCase().includes(q) ||
                          lang.native.toLowerCase().includes(q) ||
                          lang.region.toLowerCase().includes(q) ||
                          lang.desc.toLowerCase().includes(q)
                        );
                      }
                      if (regionFilter === 'all') return true;
                      const text = (lang.region + ' ' + lang.desc).toLowerCase();
                      if (regionFilter === 'south') {
                        return (
                          text.includes('tamil') ||
                          text.includes('telangana') ||
                          text.includes('karnataka') ||
                          text.includes('kerala') ||
                          text.includes('deccan')
                        );
                      }
                      if (regionFilter === 'west') {
                        return (
                          text.includes('maharashtra') ||
                          text.includes('gujarat') ||
                          text.includes('rajasthan') ||
                          text.includes('goa') ||
                          text.includes('western')
                        );
                      }
                      if (regionFilter === 'north') {
                        return (
                          text.includes('north') ||
                          text.includes('punjab') ||
                          text.includes('haryana') ||
                          text.includes('jammu') ||
                          text.includes('craft')
                        );
                      }
                      if (regionFilter === 'east') {
                        return (
                          text.includes('bengal') ||
                          text.includes('odisha') ||
                          text.includes('bihar') ||
                          text.includes('assam') ||
                          text.includes('jharkhand') ||
                          text.includes('chhattisgarh') ||
                          text.includes('manipur') ||
                          text.includes('himalayan')
                        );
                      }
                      return true;
                    }).map((lang) => {
                      const isSelected = selectedLang === lang.code;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => {
                            setSelectedLang(lang.code);
                            if (isLocale(lang.code)) {
                              setLocale(lang.code as Locale);
                            }
                          }}
                          className={`flex items-center justify-between rounded-2xl p-4 sm:p-5 text-left transition-all duration-200 ${
                            isSelected
                              ? 'border-2 border-[#0B57D0] bg-white shadow-md'
                              : 'border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`flex size-13 shrink-0 items-center justify-center rounded-xl text-lg font-bold transition-colors ${
                                isSelected
                                  ? 'bg-[#0B57D0] text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {lang.glyph}
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-base font-bold text-slate-900">
                                  {lang.native}
                                </p>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                  {lang.name}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                {lang.region} &bull; {lang.desc}
                              </p>
                            </div>
                          </div>

                          {isSelected ? (
                            <span className="text-xl font-bold text-[#0B57D0] pr-2">
                              &rarr;
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* ----------------------------------------------------
                 STEP 2: LEARNING MODE (Voice vs Reading)
                 ---------------------------------------------------- */}
              {stepIndex === 1 ? (
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {t('onboarding.mode')}
                  </h2>
                  <p className="mt-2 text-sm sm:text-base text-slate-500">
                    Choose how you want to interact while inspecting machinery on the shop floor.
                  </p>

                  <div className="mt-8 flex flex-col gap-4">
                    {/* Voice-First Card */}
                    <button
                      type="button"
                      onClick={() => setMode('speech')}
                      className={`flex items-center justify-between rounded-2xl p-5 text-left transition-all duration-200 ${
                        mode === 'speech'
                          ? 'border-2 border-[#0B57D0] bg-white shadow-md'
                          : 'border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex size-13 items-center justify-center rounded-xl transition-colors ${
                            mode === 'speech'
                              ? 'bg-[#0B57D0] text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-bold text-slate-900">
                              {t('onboarding.modeSpeech')}
                            </p>
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                              Recommended
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {t('onboarding.modeSpeechDesc')}
                          </p>
                        </div>
                      </div>

                      {mode === 'speech' ? (
                        <span className="text-xl font-bold text-[#0B57D0] pr-2">
                          &rarr;
                        </span>
                      ) : null}
                    </button>

                    {/* Reading Mode Card */}
                    <button
                      type="button"
                      onClick={() => setMode('text')}
                      className={`flex items-center justify-between rounded-2xl p-5 text-left transition-all duration-200 ${
                        mode === 'text'
                          ? 'border-2 border-[#0B57D0] bg-white shadow-md'
                          : 'border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex size-13 items-center justify-center rounded-xl transition-colors ${
                            mode === 'text'
                              ? 'bg-[#0B57D0] text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>

                        <div>
                          <p className="text-base font-bold text-slate-900">
                            {t('onboarding.modeText')}
                          </p>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {t('onboarding.modeTextDesc')}
                          </p>
                        </div>
                      </div>

                      {mode === 'text' ? (
                        <span className="text-xl font-bold text-[#0B57D0] pr-2">
                          &rarr;
                        </span>
                      ) : null}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* ----------------------------------------------------
                 STEP 3: TRADE / SPECIALIZATION
                 ---------------------------------------------------- */}
              {stepIndex === 2 ? (
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {t('onboarding.profession')}
                  </h2>
                  <p className="mt-2 text-sm sm:text-base text-slate-500">
                    Choose your primary machine maintenance trade at Bharat Precision Engineering.
                  </p>

                  <div className="mt-7 flex flex-col gap-3.5">
                    {PROFESSIONS.map((p) => {
                      const isSelected = profession === p.title;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setProfession(p.title);
                            setTradeId(p.id);
                          }}
                          className={`flex items-center justify-between rounded-2xl p-4 sm:p-5 text-left transition-all duration-200 ${
                            isSelected
                              ? 'border-2 border-[#0B57D0] bg-white shadow-md'
                              : 'border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`flex size-12 sm:size-13 items-center justify-center rounded-xl transition-colors ${
                                isSelected
                                  ? 'bg-[#0B57D0] text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              <TradeIcon type={p.iconType} />
                            </div>

                            <div>
                              <p className="text-xs sm:text-sm font-bold tracking-wide text-slate-900">
                                {p.title}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {p.subtitle}
                              </p>
                            </div>
                          </div>

                          {isSelected ? (
                            <span className="text-xl font-bold text-[#0B57D0] pr-2">
                              &rarr;
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* ----------------------------------------------------
                 STEP 4: PROFICIENCY / SKILL TIER
                 ---------------------------------------------------- */}
              {stepIndex === 3 ? (
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {t('onboarding.skillLevel')}
                  </h2>
                  <p className="mt-2 text-sm sm:text-base text-slate-500">
                    This determines your induction training path and initial assessment complexity.
                  </p>

                  <div className="mt-8 flex flex-col gap-4">
                    {SKILL_LEVELS.map((lvl) => {
                      const isSelected = skillLevel === lvl.id;
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setSkillLevel(lvl.id)}
                          className={`flex items-center justify-between rounded-2xl p-5 text-left transition-all duration-200 ${
                            isSelected
                              ? 'border-2 border-[#0B57D0] bg-white shadow-md'
                              : 'border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`flex size-13 items-center justify-center rounded-xl font-mono text-sm font-bold transition-colors ${
                                isSelected
                                  ? 'bg-[#0B57D0] text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {lvl.id}
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <p
                                  className="text-sm font-bold tracking-wide text-slate-900"
                                  dangerouslySetInnerHTML={{ __html: lvl.title }}
                                />
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#0B57D0]">
                                  {lvl.badge}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                {lvl.subtitle}
                              </p>
                            </div>
                          </div>

                          {isSelected ? (
                            <span className="text-xl font-bold text-[#0B57D0] pr-2">
                              &rarr;
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Navigation Action Buttons */}
              <div className="mt-10 flex items-center justify-between gap-4 pt-6 border-t border-slate-200">
                {stepIndex > 0 ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="rounded-xl px-6 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                  >
                    &larr; Back
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-2 rounded-xl bg-[#0B57D0] px-8 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-[#094bb8] active:scale-[0.99] transition-all"
                >
                  {stepIndex === totalSteps - 1 ? 'Start Learning' : 'Continue'} &rarr;
                </button>
              </div>
            </>
          ) : (
            /* Plan Generation Loading Animation */
            <div className="py-16 text-center my-auto">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-[#0B57D0]">
                <svg className="size-8 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>

              <h3 className="mt-6 text-2xl font-bold text-slate-900">
                Setting up your training plan...
              </h3>
              <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
                Synthesizing Bharat Precision Engineering plant SOPs and digital twins for {profession}.
              </p>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-left text-xs space-y-3 max-w-sm mx-auto shadow-xs">
                <div className="flex items-center gap-2.5 font-medium text-slate-800">
                  <svg className="size-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Trade: {profession}</span>
                </div>
                <div className="flex items-center gap-2.5 font-medium text-slate-800">
                  <svg className="size-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Level: {skillLevel} (Induction)</span>
                </div>
                <div className="flex items-center gap-2.5 font-medium text-slate-800">
                  <svg className="size-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>
                    Language:{' '}
                    {(INDIAN_LANGUAGES.find((l) => l.code === selectedLang) || INDIAN_LANGUAGES[0]).native} ({(INDIAN_LANGUAGES.find((l) => l.code === selectedLang) || INDIAN_LANGUAGES[0]).name})
                  </span>
                </div>
                <div className="flex items-center gap-2.5 font-medium text-slate-800">
                  <svg className="size-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>3D Digital Twin: HPU-400 Unit</span>
                </div>
              </div>

              <p className="mt-6 text-xs font-semibold text-[#0B57D0] animate-pulse">
                Redirecting to Worker Dashboard...
              </p>
            </div>
          )}
        </div>

        {/* Bottom Utility / Terms Footer */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-4 border-t border-slate-100">
          <span>SkillBridge Industrial OS &bull; Bharat Precision Engineering</span>
          <span>Terms & Privacy</span>
        </div>
      </div>
    </main>
  );
}
