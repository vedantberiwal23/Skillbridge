'use client';

import { useState } from 'react';
import Link from 'next/link';

import { useI18n } from '@/i18n/provider';
import { LanguageDropdown } from '@/components/ui/language-dropdown';
import { useProfile } from '@/components/providers/profile-provider';
import { TRADES_CATALOG, type TradeTrack } from '@/data/curriculum';
import { TourLauncher } from '@/components/tour/tour-provider';

export default function PlanPage() {
  const { profile } = useProfile();
  const { locale, setLocale, t } = useI18n();

  // Active trade track initialized from localStorage if present
  const [selectedTradeKey, setSelectedTradeKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedTradeId = localStorage.getItem('sb_worker_trade_id');
        if (savedTradeId && TRADES_CATALOG[savedTradeId]) {
          return savedTradeId;
        }
      } catch {
        // ignore
      }
    }
    return 'hydraulics';
  });

  const [completedLessonIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedCompleted = localStorage.getItem('sb_completed_modules');
        if (savedCompleted) {
          const parsed = JSON.parse(savedCompleted);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // ignore
      }
    }
    return ['lesson-hpu-overview'];
  });

  const tradeTrack: TradeTrack = TRADES_CATALOG[selectedTradeKey] || TRADES_CATALOG.hydraulics;

  // Track open accordion sections (Section 1 open by default)
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({
    1: true,
    2: false,
    3: false,
  });

  const [isAskingVoice, setIsAskingVoice] = useState(false);

  const toggleSection = (seq: number) => {
    setOpenSections((prev) => ({
      ...prev,
      [seq]: !prev[seq],
    }));
  };

  const handleSelectTrade = (tradeId: string) => {
    setSelectedTradeKey(tradeId);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sb_worker_trade_id', tradeId);
      } catch {
        // ignore
      }
    }
  };

  // Calculate dynamic progress
  const totalModules = tradeTrack.stages.reduce((acc, s) => acc + s.items.length, 0);
  const completedCount = tradeTrack.stages.reduce(
    (acc, s) =>
      acc + s.items.filter((i) => completedLessonIds.includes(i.lessonId)).length,
    0
  );
  const progressPct = Math.round((completedCount / totalModules) * 100) || 25;

  return (
    <main className="flex min-h-screen w-full flex-col lg:flex-row bg-background">
      {/* =======================================================
         LEFT BRAND & OVERVIEW CANVAS (#0B57D0)
         ======================================================= */}
      <div className="flex w-full flex-col justify-between bg-primary px-8 py-10 lg:w-[36%] lg:min-h-screen lg:px-14 lg:py-16 text-white shrink-0">
        {/* Top: Logo & Plant Badge */}
        <div>
          <Link href="/lander" className="inline-flex items-center gap-3 group">
            <div className="flex size-10 items-center justify-center rounded-xl bg-white text-primary font-black text-xl shadow-xs transition-transform group-hover:scale-105">
              S
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              SkillBridge
            </span>
          </Link>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-white font-bold text-sm backdrop-blur-xs border border-white/20">
              RK
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">
                {profile?.name ?? ''}
              </p>
              <p className="text-xs text-white/70 mt-0.5">
                Bharat Precision Engineering &bull; Unit #2
              </p>
            </div>
          </div>
        </div>

        {/* Center: Bold Editorial Typography & Progress */}
        <div className="my-12 lg:my-0 max-w-md">
          <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-bold leading-[1.16] tracking-tight text-white">
            Step into your shift fully prepared.
          </h1>

          <p className="mt-5 text-base sm:text-lg text-white/80 leading-relaxed font-normal">
            {tradeTrack.name}
            <br />
            {completedCount} of {totalModules} vocational SOP modules verified.
          </p>

          {/* Minimalist Progress Meter */}
          <div className="mt-8">
            <div className="flex items-center justify-between text-xs font-semibold text-white/90 mb-2">
              <span>{tradeTrack.digitalTwin}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Bottom: Plant Offline Sync Status */}
        <div className="pt-8 border-t border-white/15">
          <div className="flex items-center justify-between text-xs text-white/70">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400" />
              <span>Shop-Floor Offline Cache Ready</span>
            </div>
            <span className="font-mono text-white/50">Plant #2</span>
          </div>
        </div>
      </div>

      {/* =======================================================
         RIGHT WORKSPACE CANVAS (#F8FAFC)
         ======================================================= */}
      <div className="flex flex-1 flex-col justify-between px-6 py-10 sm:px-12 lg:px-16 lg:py-16 bg-background">
        {/* Top Header: Track Name & Language Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-8">
          <div>
            <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Worker Training Console &bull; {tradeTrack.industry}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Language Switcher */}
            <LanguageDropdown value={locale} onChange={setLocale} />

            <div className="flex items-center gap-2.5">
              <Link
                href="/worker-file"
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 px-3.5 py-1.5 text-xs font-bold shadow-2xs transition-all inline-flex items-center gap-1.5"
              >
                <svg className="size-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{t('worker.workerFile')}</span>
              </Link>
              <Link
                href="/library"
                className="rounded-xl bg-primary hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs transition-all"
              >
                Sim Library (976)
              </Link>
              {/*
                Was a Link to the public marketing page. A signed-in
                worker who wanted help landed on the sales site, which then
                offers a Login button and makes them think they were signed out.
                The guided tour is what "Help" should actually do, and it is
                already built, localized and replayable.
              */}
              <TourLauncher
                variant="icon"
                className="hidden shrink-0 sm:inline-flex"
              />
            </div>
          </div>
        </div>

        {/* Main Content Area: Vertical Timeline Accordion */}
        <div className="my-auto mx-auto w-full max-w-3xl py-6">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Training Roadmap &bull; {tradeTrack.name}
              </h2>
              <p className="mt-1.5 text-sm sm:text-base text-slate-500">
                {tradeTrack.description}
              </p>
            </div>
          </div>

          {/* Trade Quick-Switch Tabs (Easily switch curriculum across the 5 trades) */}
          <div className="mb-8 flex flex-wrap gap-2">
            {Object.values(TRADES_CATALOG).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTrade(t.id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  selectedTradeKey === t.id
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {t.name.replace(' Technician', '').replace(' Specialist', '').replace(' Operator', '')}
              </button>
            ))}
          </div>

          {/* Timeline Container */}
          <div className="space-y-6">
            {tradeTrack.stages.map((stage, idx) => {
              const isOpen = Boolean(openSections[stage.seq]);
              const isLast = idx === tradeTrack.stages.length - 1;

              return (
                <div key={stage.seq} className="relative flex items-start gap-4 sm:gap-6">
                  {/* Left Column: Numbered Circle + Vertical Line */}
                  <div className="relative flex flex-col items-center shrink-0 pt-6">
                    {/* Circle */}
                    <div className="relative z-10 flex size-7 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-700 shadow-2xs">
                      {stage.seq}
                    </div>

                    {/* Connecting vertical line to next circle */}
                    {!isLast && (
                      <div className="absolute top-13 -bottom-6 w-[1.5px] bg-slate-200 z-0" />
                    )}
                  </div>

                  {/* Right Column: Expandable Card */}
                  <div className="flex-1 rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden transition-all">
                    {/* Accordion Header */}
                    <button
                      type="button"
                      onClick={() => toggleSection(stage.seq)}
                      className="flex w-full items-center justify-between p-6 text-left hover:bg-slate-50/60 transition-colors cursor-pointer"
                    >
                      <div className="pr-4">
                        <h3 className="text-lg font-bold tracking-tight text-slate-900">
                          {stage.title}
                        </h3>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500">
                          {stage.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 text-slate-500">
                        <span className="text-xs sm:text-sm font-medium text-slate-600">
                          {stage.items.length} modules
                        </span>
                        <svg
                          className={`size-4 text-slate-400 transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Accordion Expanded Content (List of Modules) */}
                    {isOpen && (
                      <div className="border-t border-slate-100 divide-y divide-slate-100">
                        {stage.items.map((item, itemIdx) => {
                          const isDone = completedLessonIds.includes(item.lessonId);
                          const isInProgress = !isDone && (item.status === 'in-progress' || itemIdx === 0);

                          return (
                            <Link
                              key={item.id}
                              href={`/lesson/${item.lessonId}`}
                              className="group flex items-center justify-between px-6 py-4 hover:bg-slate-50/80 transition-colors"
                            >
                              <div className="flex items-center gap-3.5 pr-4">
                                {/* Indicator Dot / Check */}
                                {isDone ? (
                                  <div className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xs">
                                    <svg
                                      className="size-2.5"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={3}
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                ) : isInProgress ? (
                                  <div className="flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 border-blue-600 bg-white">
                                    <span className="size-1.5 rounded-full bg-blue-600" />
                                  </div>
                                ) : (
                                  <div className="size-4.5 shrink-0 rounded-full border-2 border-slate-300 bg-white" />
                                )}

                                <div>
                                  <span className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors block">
                                    {item.title}
                                  </span>
                                  {isInProgress && (
                                    <span className="text-xs text-primary font-medium mt-0.5 inline-block">
                                      Active Simulation Ready &bull; Tap to launch
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-slate-500 font-medium group-hover:text-slate-900 transition-colors">
                                  {isDone ? 'Completed' : item.meta} &rarr;
                                </span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Docked Hands-Free Voice Assistant Bar */}
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary border border-blue-100">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Shop-Floor Voice Tutor &bull; {tradeTrack.name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hold button to ask machine questions aloud in your native language
                </p>
              </div>
            </div>

            <button
              type="button"
              onMouseDown={() => setIsAskingVoice(true)}
              onMouseUp={() => setIsAskingVoice(false)}
              onTouchStart={() => setIsAskingVoice(true)}
              onTouchEnd={() => setIsAskingVoice(false)}
              className={`rounded-xl px-5 py-2.5 text-xs font-bold transition-all shrink-0 ${
                isAskingVoice
                  ? 'bg-primary text-white scale-95'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {isAskingVoice ? 'Listening to voice...' : 'Hold to Ask'}
            </button>
          </div>
        </div>

        {/* Bottom Utility Footer */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-6 border-t border-slate-100">
          <span>SkillBridge Industrial OS &bull; Bharat Precision Engineering</span>
          <Link href="/progress" className="hover:text-slate-600 transition-colors">
            View Certification Scorecard &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
