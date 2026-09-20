'use client';

import React from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { INDIAN_LANGUAGES, type IndianLanguage } from '@/i18n/config';
import { useI18nSafe } from '@/i18n/provider';
import { triggerPageTranslation } from '@/components/providers/google-translate';

export interface LanguageDropdownProps {
  value?: string;
  onChange?: (code: string) => void;
  className?: string;
  compact?: boolean;
}

export function LanguageDropdown({
  value: propValue,
  onChange: propOnChange,
  className = '',
  compact = false,
}: LanguageDropdownProps) {
  const i18n = useI18nSafe();

  const activeValue = propValue || i18n?.locale || 'hi';
  const currentLang: IndianLanguage =
    INDIAN_LANGUAGES.find((l) => l.code === activeValue) ||
    INDIAN_LANGUAGES.find((l) => l.code === 'hi') ||
    INDIAN_LANGUAGES[0];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCode = e.target.value;
    if (propOnChange) {
      propOnChange(newCode);
    }
    if (i18n) {
      i18n.setLocale(newCode);
    }
    triggerPageTranslation(newCode);
  };

  // Group languages into Constitutional Scheduled (22 Official) and Industrial Dialects
  const scheduledLanguages = INDIAN_LANGUAGES.filter(
    (l) => !['bho', 'raj', 'bgc', 'hne'].includes(l.code)
  );
  const regionalDialects = INDIAN_LANGUAGES.filter((l) =>
    ['bho', 'raj', 'bgc', 'hne'].includes(l.code)
  );

  return (
    <div
      className={`relative inline-flex items-center rounded-lg border border-border bg-card shadow-xs transition hover:border-border hover:bg-muted text-foreground ${className}`}
    >
      <div className="flex items-center gap-1.5 pl-2.5 pr-7 py-1 text-xs font-medium cursor-pointer pointer-events-none select-none">
        <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-semibold text-foreground truncate max-w-[130px]">
          {compact ? currentLang.native : `${currentLang.native} (${currentLang.name})`}
        </span>
      </div>

      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2 pointer-events-none" />

      {/* Accessible native select overlay with full styling */}
      <select
        value={activeValue}
        onChange={handleChange}
        aria-label="Select Language (22 Indian Languages)"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base sm:text-xs"
      >
        <optgroup label="22 Official Constitutional Languages (8th Schedule)">
          {scheduledLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.native} — {lang.name} ({lang.region})
            </option>
          ))}
        </optgroup>
        <optgroup label="Industrial Workforce Dialects">
          {regionalDialects.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.native} — {lang.name} ({lang.region})
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

