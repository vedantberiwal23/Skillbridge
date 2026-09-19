'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { InteractiveSimulation } from '@/components/viewer/interactive-simulation';
import { AskPanel } from '@/components/worker/ask-panel';
import { useVoiceAsk } from '@/lib/voice/use-voice-ask';
import { useI18n } from '@/i18n/provider';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';
import type { LessonContent } from '@/data/curriculum';

export function LessonView({ lesson }: { lesson: LessonContent }) {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();

  // Selected hotspot for voice questions
  /**
   * `?component=<id>` opens the simulation on a specific part.
   *
   * This is what joins the two halves of a Machine Twin: the reconstructed
   * exterior of the customer's own machine, and the authored internals for that
   * machine type. Selecting a part on the twin links here, and the worker lands
   * on the same part rather than at the top of the lesson.
   *
   * Seeded in a lazy initialiser rather than an effect so there is no frame
   * showing the wrong part, and no setState-in-effect. An unknown or absent id
   * falls back to the lesson's own first component.
   */
  const searchParams = useSearchParams();
  const requestedComponentId = searchParams.get('component');

  const [selectedPart, setSelectedPart] = useState<{ id: string; label: string }>(() => {
    const components = lesson.simulationConfig.components;
    const requested = requestedComponentId
      ? components.find((component) => component.id === requestedComponentId)
      : undefined;
    const chosen = requested ?? components[0];
    return {
      id: chosen?.id || 'pump',
      label: chosen?.label || 'Hydraulic Pump',
    };
  });
  const ask = useVoiceAsk(locale, selectedPart.label);

  // Checklist of SOP steps completed by worker
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});

  // Has worker completed all SOP steps?
  const allStepsChecked =
    lesson.procedureSteps.length > 0 &&
    lesson.procedureSteps.every((step) => checkedSteps[step.step]);

  const toggleStep = (stepNumber: number) => {
    setCheckedSteps((prev) => ({
      ...prev,
      [stepNumber]: !prev[stepNumber],
    }));
  };

  const handleCompleteProcedure = () => {
    // Record completed module in localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('sb_completed_modules');
        const list: string[] = stored ? JSON.parse(stored) : [];
        if (!list.includes(lesson.lessonId)) {
          list.push(lesson.lessonId);
          localStorage.setItem('sb_completed_modules', JSON.stringify(list));
        }
      } catch {
        // ignore storage errors
      }
    }
    router.push('/plan');
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] pb-16">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs px-6 py-3.5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/plan"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-[#0B57D0] transition-colors"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>{t('worker.backToPlan')}</span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Quick Locale Selector */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-2xs">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code as Locale)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
                    locale === code
                      ? 'bg-[#0B57D0] text-white'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {LOCALE_LABELS[code]}
                </button>
              ))}
            </div>

            <span className="hidden sm:inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#0B57D0]">
              Active SOP Session
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <div className="mx-auto max-w-6xl px-6 pt-8 space-y-8">
        {/* Procedure Header Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0B57D0]">
              Standard Operating Procedure &bull; Bharat Precision Engineering
            </span>
            <span className="text-xs font-medium text-slate-500">
              Estimated duration: ~{lesson.estimatedMinutes} mins
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {lesson.title}
          </h1>
          <p className="mt-2 text-base text-slate-600 leading-relaxed max-w-3xl">
            {lesson.subtitle}
          </p>

          {/* Quick competency tags */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1 font-medium text-slate-700">
              <span className="size-1.5 rounded-full bg-blue-600" />
              Interactive Physics Simulation
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1 font-medium text-slate-700">
              <span className="size-1.5 rounded-full bg-emerald-600" />
              Voice Tutor Enabled
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1 font-medium text-slate-700">
              <span className="size-1.5 rounded-full bg-amber-600" />
              Safety Certified Protocol
            </span>
          </div>
        </div>

        {/* Section 1: Interactive 3D Digital Twin & Physics Controls */}
        <div>
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Step 1: Inspect Machine & Execute Digital Twin Controls
            </h2>
            <span className="text-xs text-slate-400">
              Tap components to inspect &bull; Test live controls below
            </span>
          </div>

          <InteractiveSimulation
            config={lesson.simulationConfig}
            selectedComponentId={selectedPart.id}
            onSelectComponent={(id, label) => setSelectedPart({ id, label })}
          />
        </div>

        {/* Section 2: Step-by-Step SOP Checklist & Learning Objectives */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* SOP Step-by-step checklist (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Step 2: Shop-Floor Standard Operating Procedure (SOP)
            </h2>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs divide-y divide-slate-100">
              {lesson.procedureSteps.map((step) => {
                const isChecked = Boolean(checkedSteps[step.step]);

                return (
                  <div
                    key={step.step}
                    onClick={() => toggleStep(step.step)}
                    className="py-4 first:pt-0 last:pb-0 flex items-start gap-4 cursor-pointer group"
                  >
                    {/* Custom Checkbox */}
                    <div
                      className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                        isChecked
                          ? 'bg-[#0B57D0] border-[#0B57D0] text-white'
                          : 'border-slate-300 bg-white group-hover:border-slate-400'
                      }`}
                    >
                      {isChecked && (
                        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400">
                          Step {step.step}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#0B57D0] transition-colors">
                          {step.title}
                        </h3>
                      </div>

                      <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
                        {step.instruction}
                      </p>

                      {step.safetyCaution && (
                        <div className="mt-2.5 rounded-lg bg-amber-50 border border-amber-200/80 p-2.5 text-xs text-amber-800 flex items-start gap-2">
                          <svg className="size-4 shrink-0 text-amber-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span><strong>Safety Caution:</strong> {step.safetyCaution}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Learning Objectives & Competencies (1 col) */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Verified Competencies
            </h2>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                What you will be certified on:
              </h3>
              <ul className="space-y-3 text-xs sm:text-sm text-slate-600">
                {lesson.objectives.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="size-1.5 rounded-full bg-[#0B57D0] shrink-0 mt-2" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 leading-relaxed">
                  {lesson.summary}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Hands-Free Voice Tutor with Inspected Part */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200/80">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0B57D0]">
              Step 3: Hands-Free Voice Guidance
            </span>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">
              Ask Machine Questions in Your Language
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Voice tutor is currently focused on:{' '}
              <strong className="text-slate-800">{selectedPart.label}</strong>
            </p>
          </div>

          {/*
            The tapped component travels straight into the turn, so "what is
            this" resolves to the part the worker is looking at. Language comes
            from the one UI locale setting — there is no second voice picker.
          */}
          <AskPanel
            partLabel={selectedPart.label}
            onAskStart={ask.start}
            onAskEnd={ask.end}
            transcript={ask.transcript || ask.partial}
            reply={ask.reply}
            channelState={ask.channel}
            error={ask.error}
            empty={ask.empty}
            grounded={ask.grounded}
          />
        </div>

        {/* Completion Action Deck */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-slate-900">
              Ready to verify this procedure?
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {allStepsChecked
                ? 'All SOP steps verified. Click below to record progress and unlock the next module.'
                : 'Complete and tick off all SOP checklist steps above before proceeding.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCompleteProcedure}
              className={`rounded-xl px-6 py-3 text-sm font-bold shadow-sm transition-all ${
                allStepsChecked
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-[#0B57D0] hover:bg-[#094bb8] text-white'
              }`}
            >
              {allStepsChecked ? 'Verify & Complete Procedure' : 'Mark Completed & Return →'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
