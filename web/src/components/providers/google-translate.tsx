'use client';

import { useEffect } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement: new (
          options: {
            pageLanguage: string;
            includedLanguages?: string;
            autoDisplay?: boolean;
            layout?: number;
          },
          elementId: string
        ) => void;
      };
    };
    googleTranslateElementInit?: () => void;
  }
}

export const GOOGLE_LANG_MAP: Record<string, string> = {
  hi: 'hi', // Hindi
  en: 'en', // English
  mr: 'mr', // Marathi
  ta: 'ta', // Tamil
  te: 'te', // Telugu
  kn: 'kn', // Kannada
  gu: 'gu', // Gujarati
  bn: 'bn', // Bengali
  pa: 'pa', // Punjabi
  ml: 'ml', // Malayalam
  or: 'or', // Odia
  as: 'as', // Assamese
  ur: 'ur', // Urdu
  bho: 'bho', // Bhojpuri
  mai: 'mai', // Maithili
  raj: 'hi', // Marwari/Rajasthani
  kok: 'gom', // Konkani (gom in Google Translate)
  ne: 'ne', // Nepali
  doi: 'doi', // Dogri
  ks: 'ur', // Kashmiri
  sat: 'sat', // Santali
  brx: 'as', // Bodo
  sd: 'sd', // Sindhi
  bgc: 'hi', // Haryanvi
  hne: 'hi', // Chhattisgarhi
  mni: 'mni-Mtei', // Manipuri
};

export function triggerPageTranslation(langCode: string) {
  if (typeof window === 'undefined') return;

  const target = GOOGLE_LANG_MAP[langCode] || langCode;
  const cookieVal = target === 'en' ? '' : `/en/${target}`;

  // 1. Set Google Translate cookie
  const host = window.location.hostname;
  document.cookie = `googtrans=${cookieVal}; path=/;`;
  if (host && host !== 'localhost') {
    document.cookie = `googtrans=${cookieVal}; path=/; domain=.${host};`;
    document.cookie = `googtrans=${cookieVal}; path=/; domain=${host};`;
  }

  // 2. Trigger the Google Translate select element if it is present
  const select = document.querySelector<HTMLSelectElement>('.goog-te-combo');
  if (select) {
    select.value = target;
    select.dispatchEvent(new Event('change'));
  } else if (target !== 'en') {
    // If not yet initialized, retry when loaded
    const attempts = [150, 400, 800, 1500];
    let done = false;
    attempts.forEach((delay) => {
      setTimeout(() => {
        if (done) return;
        const s = document.querySelector<HTMLSelectElement>('.goog-te-combo');
        if (s) {
          s.value = target;
          s.dispatchEvent(new Event('change'));
          done = true;
        }
      }, delay);
    });
  } else {
    // If resetting to english and select not present, reload
    window.location.reload();
  }
}

export function GoogleTranslateProvider() {
  useEffect(() => {
    window.googleTranslateElementInit = () => {
      if (window.google?.translate?.TranslateElement) {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            includedLanguages:
              'hi,mr,ta,te,kn,gu,bn,pa,ml,or,as,ur,bho,mai,ne,doi,sd,gom,kok,mni,sa,en',
            autoDisplay: false,
          },
          'google_translate_element'
        );

        // Apply saved language if present in localStorage
        try {
          const saved = localStorage.getItem('sb_worker_lang') || localStorage.getItem('app_language');
          if (saved && saved !== 'en') {
            setTimeout(() => {
              triggerPageTranslation(saved);
            }, 600);
          }
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return (
    <>
      <div id="google_translate_element" className="hidden pointer-events-none opacity-0 h-0 w-0 overflow-hidden" style={{ display: 'none' }} />
      <Script
        id="google-translate-script"
        src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
        strategy="afterInteractive"
      />
    </>
  );
}
