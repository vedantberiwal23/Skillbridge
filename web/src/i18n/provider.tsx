'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE } from './config';
import en from './messages/en.json';
import hi from './messages/hi.json';
import mr from './messages/mr.json';

type Messages = typeof en;

const MESSAGES: Record<string, Messages> = { en, hi: hi as Messages, mr: mr as Messages };

/** Values substituted into a message's {named} placeholders. */
export type MessageVars = Record<string, string | number>;

export interface I18nValue {
  locale: string;
  setLocale: (locale: string) => void;
  t: (path: string, vars?: MessageVars) => string;
}

export const I18nContext = createContext<I18nValue | null>(null);

const resolve = (messages: Messages | undefined, path: string): string => {
  const active = messages ?? MESSAGES[DEFAULT_LOCALE];
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], active);
  return typeof value === 'string' ? value : path;
};

/**
 * Placeholders are named, not positional, because word order moves between
 * these languages — "{done} of {total}" is "{total} में से {done}" in Hindi.
 * Building such a string by concatenation gets it wrong in one language or
 * the other.
 */
const interpolate = (template: string, vars?: MessageVars): string =>
  vars
    ? template.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in vars ? String(vars[key]) : match
      )
    : template;

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: string;
}) {
  const [locale, setLocaleState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sb_worker_lang') || localStorage.getItem('app_language');
      if (stored) return stored;
    }
    return initialLocale;
  });

  const setLocale = (newLocale: string) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sb_worker_lang', newLocale);
      localStorage.setItem('app_language', newLocale);
    }
  };

  const value: I18nValue = {
    locale,
    setLocale,
    t: (path, vars) => interpolate(resolve(MESSAGES[locale], path), vars),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

export function useI18nSafe(): I18nValue | null {
  return useContext(I18nContext);
}
