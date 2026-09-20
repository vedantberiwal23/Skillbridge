'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { useI18n } from '@/i18n/provider';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';
import type { AssessmentQuestion } from '@/lib/types';
import { submitAttempt } from '@/lib/api-client';
import { useProfile } from '@/components/providers/profile-provider';

export function AssessmentView({ assessmentId }: { assessment?: unknown; assessmentId: string }) {
  const { locale, setLocale, t } = useI18n();
  const { profile } = useProfile();

  /**
   * Questions come from the assessment itself, over the API.
   *
   * They used to be a hardcoded bank in `@/data/questions`, filtered by a trade
   * id read out of localStorage. That made every org's assessment identical
   * regardless of its course material, ignored which assessment was actually
   * opened, and shipped the answer key to the browser inside the bundle. Now
   * `GET /api/assessments?assessmentId=` returns the `ASMT#` item and the
   * questions seeded onto it, so the content follows the org's own lessons.
   */
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    // No synchronous setState here: the initial value is already 'loading', and
    // the `cancelled` guard covers a changed assessmentId.
    fetch(`/api/assessments?assessmentId=${encodeURIComponent(assessmentId)}`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list: AssessmentQuestion[] = data?.assessment?.questions ?? [];
        setQuestions(list);
        setTitle(data?.assessment?.title ?? null);
        setLoadState(list.length > 0 ? 'ready' : 'missing');
      })
      .catch(() => !cancelled && setLoadState('missing'));
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const tradeQuestions = questions;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  /**
   * Every answer given, in order, for the server-side attempt.
   *
   * The local `score` above drives the running tally the worker sees between
   * questions — immediate feedback, nothing more. It is deliberately NOT sent:
   * `POST /api/assessments` takes `{ assessmentId, response }` and has no
   * `score` field, because an attempt is graded by the async scorer agent. A
   * client that could report its own score could report a perfect one.
   */
  const [answers, setAnswers] = useState<{ questionId: string; selectedIndex: number }[]>([]);
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'recorded' | 'failed'>('idle');

  const currentQ = tradeQuestions[currentIndex] ?? tradeQuestions[0];
  const isCorrect = currentQ ? selectedOption === currentQ.correctIndex : false;

  const handleSubmitAnswer = () => {
    if (selectedOption === null) return;
    setIsSubmitted(true);
    setAnswers((prev) => [...prev, { questionId: currentQ.id, selectedIndex: selectedOption }]);
    if (selectedOption === currentQ.correctIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < tradeQuestions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsSubmitted(false);
    } else {
      setIsCompleted(true);
      // Save badge earned in localStorage
      if (typeof window !== 'undefined') {
        try {
          const badges = JSON.parse(localStorage.getItem('sb_earned_badges') || '[]');
          if (!badges.includes(currentQ.topic)) {
            badges.push(currentQ.topic);
            localStorage.setItem('sb_earned_badges', JSON.stringify(badges));
          }
        } catch {
          // ignore
        }
      }
    }
  };

  const scorePct = Math.round((score / tradeQuestions.length) * 100);

  /**
   * Hand the attempt to the server exactly once.
   *
   * Guarded by a ref rather than by `submitState`, because React 18+ mounts
   * effects twice in development; keying off state would post the attempt
   * twice and the scorer would bill two model calls for one run.
   */
  const submitted = useRef(false);
  useEffect(() => {
    if (!isCompleted || submitted.current) return;
    submitted.current = true;
    setSubmitState('sending');
    submitAttempt(assessmentId, { kind: 'diagnose-by-voice', answers, locale })
      .then(() => setSubmitState('recorded'))
      .catch(() => setSubmitState('failed'));
  }, [isCompleted, assessmentId, answers, locale]);

  /**
   * Nothing to answer yet, or nothing to answer at all.
   *
   * The questions arrive over the network now, so there is a frame before they
   * land, and an assessment can legitimately carry none. Rendering the quiz
   * shell against an undefined question is how this produces a blank card with
   * dead buttons, so both states get their own screen instead.
   */
  if (loadState !== 'ready' || !currentQ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-6">
        <div className="max-w-md text-center">
          {loadState === 'loading' ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-slate-900">
                {title ?? t('worker.assessment')}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {t('worker.assessmentEmpty')}
              </p>
              <Link
                href="/plan"
                className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#0B57D0] px-5 text-sm font-semibold text-white"
              >
                {t('common.back')}
              </Link>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-16">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs px-6 py-3.5">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href="/plan"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-primary transition-colors"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>{t('worker.backToPlan')}</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-2xs">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code as Locale)}
                  className={`min-h-11 rounded-lg px-3 py-2 font-semibold transition-all ${
                    locale === code
                      ? 'bg-primary text-white'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {LOCALE_LABELS[code]}
                </button>
              ))}
            </div>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-primary">
              {t('assessment.diagnosticVerification')}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-3xl px-6 pt-10">
        {!isCompleted ? (
          <div className="space-y-6">
            {/* Progress & Header */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  {t('assessment.sopCompetency')} &bull; {currentQ.topic}
                </span>
                <p className="text-sm font-semibold text-slate-500 mt-0.5">
                  {t('assessment.questionOf', { current: currentIndex + 1, total: tradeQuestions.length })}
                </p>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                Score: {score}/{currentIndex + (isSubmitted ? 1 : 0)}
              </div>
            </div>

            {/* Question Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 leading-snug">
                {currentQ.prompt}
              </h2>

              {/* Options */}
              <div className="mt-6 space-y-3">
                {currentQ.options.map((option, idx) => {
                  const isSelected = selectedOption === idx;
                  let cardStyle =
                    'border border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60';

                  if (isSubmitted) {
                    if (idx === currentQ.correctIndex) {
                      cardStyle = 'border-2 border-emerald-500 bg-emerald-50/50 text-emerald-900';
                    } else if (isSelected && !isCorrect) {
                      cardStyle = 'border-2 border-red-400 bg-red-50/50 text-red-900';
                    } else {
                      cardStyle = 'border border-slate-200 bg-slate-50/50 opacity-60';
                    }
                  } else if (isSelected) {
                    cardStyle = 'border-2 border-primary bg-blue-50/40 shadow-xs';
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isSubmitted}
                      onClick={() => setSelectedOption(idx)}
                      className={`flex w-full items-start gap-4 rounded-xl p-4 text-left transition-all ${cardStyle}`}
                    >
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                          isSubmitted && idx === currentQ.correctIndex
                            ? 'bg-emerald-600 text-white'
                            : isSubmitted && isSelected && !isCorrect
                              ? 'bg-red-500 text-white'
                              : isSelected
                                ? 'bg-primary text-white'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>

                      <span className="text-sm font-medium text-slate-800 leading-relaxed">
                        {option}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Explanation Banner when Submitted */}
              {isSubmitted && (
                <div
                  className={`mt-6 rounded-xl p-4 text-xs leading-relaxed border ${
                    isCorrect
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <p className="font-bold text-sm mb-1">
                    {isCorrect ? 'Correct Verification ✓' : 'Incorrect SOP Reference'}
                  </p>
                  <p>{currentQ.explanation}</p>
                  <p className="mt-2 text-xs font-mono text-slate-500">
                    Standard: {currentQ.safetyRef}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-7 flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                  {isSubmitted ? 'Response recorded in audit log' : 'Select one option to verify'}
                </span>

                {!isSubmitted ? (
                  <button
                    type="button"
                    disabled={selectedOption === null}
                    onClick={handleSubmitAnswer}
                    className={`rounded-xl px-6 py-2.5 text-xs font-bold transition-all ${
                      selectedOption !== null
                        ? 'bg-primary hover:bg-primary/85 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Submit Answer &rarr;
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="rounded-xl bg-primary hover:bg-primary/85 px-6 py-2.5 text-xs font-bold text-white shadow-xs transition-all"
                  >
                    {currentIndex < tradeQuestions.length - 1 ? 'Next Question →' : 'Complete Assessment →'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Assessment Completed Screen */
          <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-10 shadow-xs text-center space-y-6">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-xs">
              <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                SOP Verification Completed
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-3">
                Diagnostic Score: {scorePct}%
              </h2>
              {/*
                The percentage above is this run's immediate tally. The graded
                result is the scorer agent's, which arrives asynchronously —
                this line says which one the worker is looking at rather than
                letting the local number stand in for a verified score.
              */}
              <p
                className={`mt-2 text-xs font-medium ${
                  submitState === 'failed' ? 'text-amber-700' : 'text-slate-500'
                }`}
              >
                {submitState === 'sending' && t('assessment.recording')}
                {submitState === 'recorded' && t('assessment.recorded')}
                {submitState === 'failed' && t('assessment.recordFailed')}
              </p>
              <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                You scored {score} out of {tradeQuestions.length} technical diagnostics.
                {scorePct >= 70
                  ? ' Congratulations! You have passed the theoretical verification for this track.'
                  : ' Review the interactive simulation and SOP steps before retrying.'}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs max-w-sm mx-auto text-left space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Technician:</span>
                <strong className="text-slate-900">{profile?.name ?? '—'}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Plant:</span>
                <strong className="text-slate-900">Bharat Precision &bull; Unit #2</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Audit Ref:</span>
                <span className="font-mono text-slate-500">{assessmentId}</span>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/plan"
                className="w-full sm:w-auto rounded-xl bg-primary hover:bg-primary/85 px-8 py-3 text-xs font-bold text-white shadow-xs transition-all"
              >
                Return to Training Roadmap &rarr;
              </Link>
              <Link
                href="/progress"
                className="w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 px-6 py-3 text-xs font-bold text-slate-700 transition-colors"
              >
                View Skill Scorecard
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
