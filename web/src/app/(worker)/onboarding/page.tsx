'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Box,
  Check,
  Loader2,
  Mic,
  Search,
} from 'lucide-react';
import { cn } from 'cn';

import { useI18n } from '@/i18n/provider';
import { INDIAN_LANGUAGES, isLocale, type Locale } from '@/i18n/config';
import { useProfile } from '@/components/providers/profile-provider';
import { TRADES_CATALOG } from '@/data/curriculum';

/**
 * First-run setup for a worker who has just redeemed an invite.
 *
 * Starts by saying what SkillBridge is, then asks the four things the product
 * needs — language, learning mode, trade, level — one per screen, and ends on a
 * review the worker can edit before anything is saved.
 *
 * Choices are written to the worker's own PROFILE and SETTINGS through
 * PATCH /api/me, so they follow the worker to any device. The same values are
 * mirrored into the localStorage keys that /home, /plan and the lesson screens
 * still read their trade from; dropping that mirror would reset those screens
 * to the default trade.
 *
 * Finishing hands off to /home with `?tour=1`, which starts the guided tour.
 */

type StepId = 'welcome' | 'language' | 'mode' | 'trade' | 'level' | 'review';
const STEPS: StepId[] = ['welcome', 'language', 'mode', 'trade', 'level', 'review'];

const LEVELS = [
  { id: 'Level 1', titleKey: 'onboarding.level1', descKey: 'onboarding.level1Desc' },
  { id: 'Level 2', titleKey: 'onboarding.level2', descKey: 'onboarding.level2Desc' },
  { id: 'Level 3', titleKey: 'onboarding.level3', descKey: 'onboarding.level3Desc' },
] as const;

/** Copy that is new with this flow. Existing strings come from the i18n catalogue. */
const COPY: Record<
  Locale,
  {
    hello: string;
    intro: string;
    features: [string, string][];
    minute: string;
    start: string;
    next: string;
    back: string;
    languageHint: string;
    search: string;
    uiNote: (lang: string) => string;
    tradeHint: string;
    levelHint: string;
    modeHint: string;
    reviewTitle: string;
    reviewHint: string;
    edit: string;
    rows: { language: string; mode: string; trade: string; level: string };
    create: string;
    saving: string;
    saveError: string;
    doneTitle: string;
    doneBody: string;
    tour: string;
    skipTour: string;
    step: (n: number, total: number) => string;
  }
> = {
  en: {
    hello: 'Welcome',
    intro: 'SkillBridge is your training partner on the shop floor.',
    features: [
      ['Ask out loud, in your language', 'Hold the mic and ask. Answers come from your company’s own procedures.'],
      ['Learn on the real machine', 'Tap parts on a 3D model to see what they do and how they fail.'],
      ['Prove what you know', 'Pass short assessments to earn skills your plant can verify.'],
    ],
    minute: 'Setup takes about a minute.',
    start: 'Let’s set you up',
    next: 'Continue',
    back: 'Back',
    languageHint: 'The app and your voice tutor will use this language. You can change it later in Profile.',
    search: 'Search languages',
    uiNote: (lang) => `The app stays in English for now. Your voice tutor will speak ${lang}.`,
    tradeHint: 'We’ll build your training plan around this.',
    levelHint: 'Be honest — it only changes where your plan starts.',
    modeHint: 'How you want lessons to reach you while you work.',
    reviewTitle: 'Check your choices',
    reviewHint: 'Tap any row to change it.',
    edit: 'Edit',
    rows: { language: 'Language', mode: 'Learning mode', trade: 'Trade', level: 'Experience' },
    create: 'Create my training plan',
    saving: 'Saving…',
    saveError: 'Could not save. Check your connection and try again.',
    doneTitle: 'Your plan is ready',
    doneBody: 'Want a one-minute look around before your first lesson?',
    tour: 'Show me around',
    skipTour: 'Skip, go to my plan',
    step: (n, total) => `Step ${n} of ${total}`,
  },
  hi: {
    hello: 'स्वागत है',
    intro: 'SkillBridge shop floor पर आपका training साथी है।',
    features: [
      ['अपनी भाषा में बोलकर पूछें', 'Mic दबाकर पूछें। जवाब आपकी company की अपनी procedures से आते हैं।'],
      ['असली machine पर सीखें', '3D model पर parts को tap करें और देखें वे क्या करते हैं।'],
      ['जो आता है, साबित करें', 'छोटे assessments pass करके ऐसे skills कमाएँ जिन्हें plant verify करे।'],
    ],
    minute: 'Setup में लगभग एक मिनट लगता है।',
    start: 'चलिए शुरू करें',
    next: 'आगे',
    back: 'पीछे',
    languageHint: 'App और आपका voice tutor यही भाषा इस्तेमाल करेंगे। इसे बाद में Profile में बदल सकते हैं।',
    search: 'भाषा खोजें',
    uiNote: (lang) => `App अभी English में रहेगा। आपका voice tutor ${lang} में बोलेगा।`,
    tradeHint: 'आपका training plan इसी के हिसाब से बनेगा।',
    levelHint: 'सही बताइए — इससे बस यह तय होता है कि plan कहाँ से शुरू हो।',
    modeHint: 'काम करते समय आप lessons कैसे लेना चाहते हैं।',
    reviewTitle: 'अपनी choices देख लें',
    reviewHint: 'बदलने के लिए किसी भी row पर tap करें।',
    edit: 'बदलें',
    rows: { language: 'भाषा', mode: 'सीखने का तरीका', trade: 'Trade', level: 'अनुभव' },
    create: 'मेरा training plan बनाएँ',
    saving: 'Save हो रहा है…',
    saveError: 'Save नहीं हो पाया। Connection देखकर फिर से कोशिश करें।',
    doneTitle: 'आपका plan तैयार है',
    doneBody: 'पहले lesson से पहले एक मिनट का परिचय देखेंगे?',
    tour: 'हाँ, दिखाइए',
    skipTour: 'छोड़ें, मेरे plan पर जाएँ',
    step: (n, total) => `Step ${n} / ${total}`,
  },
  mr: {
    hello: 'स्वागत आहे',
    intro: 'SkillBridge हा shop floor वरचा तुमचा training साथी आहे.',
    features: [
      ['तुमच्या भाषेत बोलून विचारा', 'Mic दाबून विचारा. उत्तरे तुमच्या company च्या procedures मधून येतात.'],
      ['खऱ्या machine वर शिका', '3D model वरचे parts tap करा आणि ते काय करतात ते पाहा.'],
      ['जे येतं ते सिद्ध करा', 'छोटे assessments pass करून plant verify करू शकेल असे skills मिळवा.'],
    ],
    minute: 'Setup ला साधारण एक मिनिट लागतो.',
    start: 'चला सुरू करूया',
    next: 'पुढे',
    back: 'मागे',
    languageHint: 'App आणि तुमचा voice tutor हीच भाषा वापरतील. नंतर Profile मध्ये बदलता येईल.',
    search: 'भाषा शोधा',
    uiNote: (lang) => `App सध्या English मध्ये राहील. तुमचा voice tutor ${lang} मध्ये बोलेल.`,
    tradeHint: 'तुमचा training plan यावरच आधारित असेल.',
    levelHint: 'खरं सांगा — यामुळे फक्त plan कुठून सुरू होतो ते ठरतं.',
    modeHint: 'काम करताना lessons तुमच्यापर्यंत कसे पोहोचावेत.',
    reviewTitle: 'तुमच्या निवडी तपासा',
    reviewHint: 'बदलण्यासाठी कोणत्याही row वर tap करा.',
    edit: 'बदला',
    rows: { language: 'भाषा', mode: 'शिकण्याची पद्धत', trade: 'Trade', level: 'अनुभव' },
    create: 'माझा training plan तयार करा',
    saving: 'Save होत आहे…',
    saveError: 'Save झालं नाही. Connection तपासून पुन्हा प्रयत्न करा.',
    doneTitle: 'तुमचा plan तयार आहे',
    doneBody: 'पहिल्या lesson आधी एका मिनिटाची ओळख पाहायची?',
    tour: 'हो, दाखवा',
    skipTour: 'वगळा, माझ्या plan वर जा',
    step: (n, total) => `Step ${n} / ${total}`,
  },
};

const FEATURE_ICONS = [Mic, Box, BadgeCheck];

function mirrorToLocalStorage(values: Record<string, string>) {
  try {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the server copy is the one that matters.
  }
}

export default function OnboardingPage() {
  const { t, locale, setLocale } = useI18n();
  const { profile, settings, save } = useProfile();
  const router = useRouter();
  const activeLocale: Locale = isLocale(locale) ? locale : 'en';
  const copy = COPY[activeLocale];

  const [stepIndex, setStepIndex] = useState(0);
  const [language, setLanguage] = useState<string>(settings?.language ?? locale);
  const [mode, setMode] = useState<'speech' | 'text'>(settings?.learningMode ?? 'speech');
  const [tradeId, setTradeId] = useState<string>('hydraulics');
  const [level, setLevel] = useState<string>('Level 1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const step = STEPS[stepIndex];
  const questionSteps = STEPS.length - 1; // the welcome screen is not a question
  const firstName = (profile?.name ?? '').split(' ')[0];

  const goTo = (id: StepId) => setStepIndex(STEPS.indexOf(id));
  const next = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  const chooseLanguage = (code: string) => {
    setLanguage(code);
    if (isLocale(code)) setLocale(code);
  };

  const trade = TRADES_CATALOG[tradeId];
  const languageInfo = INDIAN_LANGUAGES.find((l) => l.code === language);

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await save({
        ...(isLocale(language) ? { language } : {}),
        learningMode: mode,
        profession: trade.name,
        skillLevel: level,
      });
      mirrorToLocalStorage({
        sb_worker_trade_id: tradeId,
        sb_worker_trade: trade.name,
        sb_worker_level: level,
        sb_worker_lang: language,
        sb_worker_mode: mode,
      });
      setDone(true);
    } catch {
      setError(copy.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-dvh w-full flex-col bg-background lg:flex-row">
      <SidePanel stepIndex={stepIndex} done={done} />

      <div className="flex flex-1 flex-col px-5 pb-8 pt-6 sm:px-10 lg:px-16 lg:py-12">
        {/* Mobile progress */}
        {step !== 'welcome' && !done ? (
          <div className="lg:hidden">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-data uppercase tracking-[0.14em]">
                {copy.step(stepIndex, questionSteps)}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${(stepIndex / questionSteps) * 100}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-8">
          {done ? (
            <Done copy={copy} onTour={() => router.push('/home?tour=1')} onSkip={() => router.push('/plan')} />
          ) : (
            <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {step === 'welcome' ? (
                <Welcome copy={copy} name={firstName} onStart={next} />
              ) : null}

              {step === 'language' ? (
                <StepFrame title={t('onboarding.language')} hint={copy.languageHint}>
                  <LanguagePicker
                    value={language}
                    onChange={chooseLanguage}
                    searchLabel={copy.search}
                  />
                  {languageInfo && !isLocale(language) ? (
                    <p className="mt-3 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                      {copy.uiNote(languageInfo.name)}
                    </p>
                  ) : null}
                </StepFrame>
              ) : null}

              {step === 'mode' ? (
                <StepFrame title={t('onboarding.mode')} hint={copy.modeHint}>
                  <div className="flex flex-col gap-3">
                    <Choice
                      selected={mode === 'speech'}
                      onClick={() => setMode('speech')}
                      icon={<Mic className="size-5" />}
                      title={t('onboarding.modeSpeech')}
                      body={t('onboarding.modeSpeechDesc')}
                    />
                    <Choice
                      selected={mode === 'text'}
                      onClick={() => setMode('text')}
                      icon={<BookOpenText className="size-5" />}
                      title={t('onboarding.modeText')}
                      body={t('onboarding.modeTextDesc')}
                    />
                  </div>
                </StepFrame>
              ) : null}

              {step === 'trade' ? (
                <StepFrame title={t('onboarding.profession')} hint={copy.tradeHint}>
                  <div className="flex flex-col gap-3">
                    {Object.values(TRADES_CATALOG).map((option) => (
                      <Choice
                        key={option.id}
                        selected={tradeId === option.id}
                        onClick={() => setTradeId(option.id)}
                        title={option.name}
                        body={option.industry}
                      />
                    ))}
                  </div>
                </StepFrame>
              ) : null}

              {step === 'level' ? (
                <StepFrame title={t('onboarding.skillLevel')} hint={copy.levelHint}>
                  <div className="flex flex-col gap-3">
                    {LEVELS.map((option) => (
                      <Choice
                        key={option.id}
                        selected={level === option.id}
                        onClick={() => setLevel(option.id)}
                        title={t(option.titleKey)}
                        body={t(option.descKey)}
                      />
                    ))}
                  </div>
                </StepFrame>
              ) : null}

              {step === 'review' ? (
                <StepFrame title={copy.reviewTitle} hint={copy.reviewHint}>
                  <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                    <ReviewRow
                      label={copy.rows.language}
                      value={languageInfo ? `${languageInfo.native} · ${languageInfo.name}` : language}
                      onEdit={() => goTo('language')}
                      editLabel={copy.edit}
                    />
                    <ReviewRow
                      label={copy.rows.mode}
                      value={mode === 'speech' ? t('onboarding.modeSpeech') : t('onboarding.modeText')}
                      onEdit={() => goTo('mode')}
                      editLabel={copy.edit}
                    />
                    <ReviewRow
                      label={copy.rows.trade}
                      value={trade.name}
                      onEdit={() => goTo('trade')}
                      editLabel={copy.edit}
                    />
                    <ReviewRow
                      label={copy.rows.level}
                      value={t(LEVELS.find((l) => l.id === level)?.titleKey ?? 'onboarding.level1')}
                      onEdit={() => goTo('level')}
                      editLabel={copy.edit}
                    />
                  </div>
                  {error ? (
                    <p role="alert" className="mt-4 rounded-xl bg-danger-muted px-4 py-3 text-sm text-danger">
                      {error}
                    </p>
                  ) : null}
                </StepFrame>
              ) : null}
            </div>
          )}
        </div>

        {step !== 'welcome' && !done ? (
          <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
            <button
              type="button"
              onClick={back}
              className="flex h-12 items-center gap-2 rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> {copy.back}
            </button>
            {step === 'review' ? (
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-70"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {saving ? copy.saving : copy.create}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
              >
                {copy.next} <ArrowRight className="size-4" />
              </button>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

/** Desktop-only rail: what this is, and where the worker is in setup. */
function SidePanel({ stepIndex, done }: { stepIndex: number; done: boolean }) {
  const { t } = useI18n();
  const labels = [
    t('onboarding.language'),
    t('onboarding.mode'),
    t('onboarding.profession'),
    t('onboarding.skillLevel'),
  ];

  return (
    <aside className="hidden w-[36%] max-w-md shrink-0 flex-col justify-between bg-foreground px-10 py-12 text-background lg:flex">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
          S
        </span>
        <span className="text-lg font-semibold tracking-tight">SkillBridge</span>
      </div>

      <ol className="flex flex-col gap-5">
        {labels.map((label, i) => {
          const n = i + 1;
          const state = done || stepIndex > n ? 'done' : stepIndex === n ? 'current' : 'todo';
          return (
            <li key={label} className="flex items-center gap-3.5">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  state === 'done' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' && 'border-background text-background',
                  state === 'todo' && 'border-background/25 text-background/40'
                )}
              >
                {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : n}
              </span>
              <span
                className={cn(
                  'text-sm transition-colors',
                  state === 'todo' ? 'text-background/45' : 'text-background',
                  state === 'current' && 'font-semibold'
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-xs leading-relaxed text-background/50">
        Your choices are saved to your account, so they follow you to any phone you sign in on.
      </p>
    </aside>
  );
}

function Welcome({
  copy,
  name,
  onStart,
}: {
  copy: (typeof COPY)[Locale];
  name: string;
  onStart: () => void;
}) {
  return (
    <div>
      <p className="font-data text-xs uppercase tracking-[0.14em] text-primary">SkillBridge</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {copy.hello}
        {name ? `, ${name}` : ''}
      </h1>
      <p className="mt-2 text-base text-muted-foreground sm:text-lg">{copy.intro}</p>

      <ul className="mt-8 flex flex-col gap-3">
        {copy.features.map(([title, body], i) => {
          const Icon = FEATURE_ICONS[i];
          return (
            <li
              key={title}
              className="flex gap-4 rounded-2xl border border-border bg-card p-4 animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${120 + i * 90}ms`, animationFillMode: 'both' }}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-base font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onStart}
        className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/85 sm:w-auto sm:px-8"
      >
        {copy.start} <ArrowRight className="size-4" />
      </button>
      <p className="mt-3 text-sm text-muted-foreground">{copy.minute}</p>
    </div>
  );
}

function StepFrame({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground sm:text-base">{hint}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Choice({
  selected,
  onClick,
  icon,
  title,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-all',
        selected
          ? 'border-primary shadow-[0_0_0_1px_var(--primary)]'
          : 'border-border hover:border-foreground/20'
      )}
    >
      {icon ? (
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors',
            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

/**
 * The three languages the app itself speaks come first as big tiles; every
 * other language the voice tutor understands is one search away.
 */
function LanguagePicker({
  value,
  onChange,
  searchLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  searchLabel: string;
}) {
  const [query, setQuery] = useState('');
  const primary = INDIAN_LANGUAGES.filter((l) => isLocale(l.code));
  const others = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INDIAN_LANGUAGES.filter((l) => !isLocale(l.code)).filter(
      (l) => !q || l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div role="radiogroup" aria-label="Language">
      <div className="grid grid-cols-3 gap-3">
        {primary.map((lang) => {
          const selected = value === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(lang.code)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl border bg-card px-2 py-5 transition-all',
                selected ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border hover:border-foreground/20'
              )}
            >
              <span className={cn('text-2xl font-semibold', selected ? 'text-primary' : 'text-foreground')}>
                {lang.glyph}
              </span>
              <span className="text-sm font-medium text-foreground">{lang.native}</span>
            </button>
          );
        })}
      </div>

      <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 focus-within:border-primary">
        <Search className="size-4 text-muted-foreground" />
        <span className="sr-only">{searchLabel}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchLabel}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
        {others.map((lang) => {
          const selected = value === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(lang.code)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-foreground/20'
              )}
            >
              {lang.native} <span className={selected ? 'opacity-80' : 'text-muted-foreground'}>· {lang.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  onEdit,
  editLabel,
}: {
  label: string;
  value: string;
  onEdit: () => void;
  editLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-base font-medium text-foreground">{value}</span>
      </span>
      <span className="shrink-0 text-sm font-medium text-primary">{editLabel}</span>
    </button>
  );
}

function Done({
  copy,
  onTour,
  onSkip,
}: {
  copy: (typeof COPY)[Locale];
  onTour: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-300">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-8" strokeWidth={2.5} />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">{copy.doneTitle}</h1>
      <p className="mt-2 max-w-sm text-base text-muted-foreground">{copy.doneBody}</p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={onTour}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
        >
          {copy.tour} <ArrowRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="h-12 rounded-xl text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copy.skipTour}
        </button>
      </div>
    </div>
  );
}
