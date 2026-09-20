'use client';

import { useState, useEffect } from 'react';

export interface LanguageSlide {
  code: string;
  name: string;
  nativeName: string;
  topRole: string;
  topModules: string;
  voiceQuestion: string;
  voiceInstructor: string;
  skillTitle: string;
  skillCategory: string;
}

export const INDIAN_LANGUAGES: LanguageSlide[] = [
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    topRole: 'सीएनसी ऑपरेटर (CNC Operator)',
    topModules: '8 में से 4 मॉड्यूल',
    voiceQuestion: '“मशीन चालू नहीं हो रही, क्या चेक करूँ?”',
    voiceInstructor: 'AI प्रशिक्षक • हिन्दी वॉइस',
    skillTitle: 'कौशल अंतर पहचाना गया',
    skillCategory: 'समस्या निवारण (Troubleshooting)',
  },
  {
    code: 'hinglish',
    name: 'Hinglish',
    nativeName: 'Hinglish',
    topRole: 'CNC Operator',
    topModules: '8 me se 4 modules complete',
    voiceQuestion: '“Machine start nahi ho rahi, kya check karu?”',
    voiceInstructor: 'AI Instructor • Voice AI',
    skillTitle: 'Skill gap identified',
    skillCategory: 'Troubleshooting',
  },
  {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    topRole: 'सीएनसी ऑपरेटर (CNC Operator)',
    topModules: '8 पैकी 4 मॉड्यूल्स पूर्ण',
    voiceQuestion: '“मशीन सुरू होत नाहीये, काय तपासू?”',
    voiceInstructor: 'AI प्रशिक्षक • मराठी व्हॉइस',
    skillTitle: 'कौशल्यातील तफावत ओळखली',
    skillCategory: 'दोष निवारण (Troubleshooting)',
  },
  {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    topRole: 'சிஎன்சி ஆபரேட்டர் (CNC Operator)',
    topModules: '8 இல் 4 தொகுதிகள் நிறைவு',
    voiceQuestion: '“மெஷின் ஸ்டார்ட் ஆகல, என்ன செக் பண்ணனும்?”',
    voiceInstructor: 'AI பயிற்றுவிப்பாளர் • தமிழ் குரல்',
    skillTitle: 'திறன் இடைவெளி கண்டறியப்பட்டது',
    skillCategory: 'சிக்கல் தீர்வு (Troubleshooting)',
  },
  {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    topRole: 'సిఎన్‌సి ఆపరేటర్ (CNC Operator)',
    topModules: '8 లో 4 మాడ్యూల్స్ పూర్తి',
    voiceQuestion: '“మెషిన్ స్టార్ట్ అవ్వడం లేదు, ఏం చెక్ చేయాలి?”',
    voiceInstructor: 'AI ఇన్‌స్ట్రక్టర్ • తెలుగు వాయిస్',
    skillTitle: 'నైపుణ్య లోపం గుర్తించబడింది',
    skillCategory: 'ట్రబుల్‌షూటింగ్ (Troubleshooting)',
  },
  {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    topRole: 'ಸಿಎನ್‌ಸಿ ಆಪರೇಟರ್ (CNC Operator)',
    topModules: '8 ರಲ್ಲಿ 4 ಮಾಡ್ಯೂಲ್‌ಗಳು ಪೂರ್ಣ',
    voiceQuestion: '“ಮೆಷಿನ್ ಸ್ಟಾರ್ಟ್ ಆಗ್ತಿಲ್ಲ, ಏನ್ ಚೆಕ್ ಮಾಡ್ಬೇಕು?”',
    voiceInstructor: 'AI ಬೋಧಕ • ಕನ್ನಡ ಧ್ವನಿ',
    skillTitle: 'ಕೌಶಲ್ಯದ ಕೊರತೆ ಗುರುತಿಸಲಾಗಿದೆ',
    skillCategory: 'ದೋಷನಿವಾರಣೆ (Troubleshooting)',
  },
  {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    topRole: 'સીએનસી ઓપરેટર (CNC Operator)',
    topModules: '8 માંથી 4 મોડ્યુલ પૂર્ણ',
    voiceQuestion: '“મશીન શરૂ નથી થતું, શું તપાસવું?”',
    voiceInstructor: 'AI પ્રશિક્ષક • ગુજરાતી અવાજ',
    skillTitle: 'કૌશલ્ય ખામી ઓળખાઈ',
    skillCategory: 'મુશ્કેલી નિવારણ (Troubleshooting)',
  },
  {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    topRole: 'সিএনসি অপারেটর (CNC Operator)',
    topModules: '৮ টির মধ্যে ৪ টি মডিউল সম্পন্ন',
    voiceQuestion: '“মেশিন চালু হচ্ছে না, কী চেক করব?”',
    voiceInstructor: 'AI প্রশিক্ষক • বাংলা ভয়েস',
    skillTitle: 'দক্ষতার ঘাটতি চিহ্নিত',
    skillCategory: 'সমস্যা সমাধান (Troubleshooting)',
  },
  {
    code: 'pa',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    topRole: 'ਸੀਐਨਸੀ ਓਪਰੇਟਰ (CNC Operator)',
    topModules: '8 ਵਿੱਚੋਂ 4 ਮੌਡਿਊਲ ਮੁਕੰਮਲ',
    voiceQuestion: '“ਮਸ਼ੀਨ ਸਟਾਰਟ ਨਹੀਂ ਹੋ ਰਹੀ, ਕੀ ਚੈੱਕ ਕਰਾਂ?”',
    voiceInstructor: 'AI ਇੰਸਟ੍ਰਕਟਰ • ਪੰਜਾਬੀ ਆਵਾਜ਼',
    skillTitle: 'ਹੁਨਰ ਦੀ ਘਾਟ ਪਛਾਣੀ ਗਈ',
    skillCategory: 'ਟ੍ਰਬਲਸ਼ੂਟਿੰਗ (Troubleshooting)',
  },
  {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    topRole: 'സിഎൻസി ഓപ്പറേറ്റർ (CNC Operator)',
    topModules: '8-ൽ 4 മൊഡ്യൂളുകൾ പൂർത്തിയായി',
    voiceQuestion: '“മെഷീൻ സ്റ്റാർട്ടാകുന്നില്ല, എന്താണ് പരിശോധിക്കേണ്ടത്?”',
    voiceInstructor: 'AI ഇൻസ്ട്രക്ടർ • മലയാളം വോയ്‌സ്',
    skillTitle: 'നൈപുണ്യ വിടവ് കണ്ടെത്തി',
    skillCategory: 'ട്രബിൾഷൂട്ടിംഗ് (Troubleshooting)',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    topRole: 'CNC Operator',
    topModules: '4 of 8 modules',
    voiceQuestion: '“Machine won’t start, what should I check?”',
    voiceInstructor: 'AI Instructor • Voice AI',
    skillTitle: 'Skill gap identified',
    skillCategory: 'Troubleshooting',
  },
];

const MACHINE_ICON =
  'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z';

export function MultilingualHeroCards() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    // Cycles every 3.2 seconds (within 2-4s range)
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % INDIAN_LANGUAGES.length);
        setFade(true);
      }, 250);
    }, 3200);

    return () => clearInterval(interval);
  }, []);

  const current = INDIAN_LANGUAGES[index];

  return (
    <>
      {/* Overlay 1: Top-left module progress card */}
      <div className="absolute -left-2 top-8 z-10 w-[270px] rounded-xl border border-border/80 bg-card p-4 shadow-[0_16px_40px_rgba(0,0,0,0.55)] sm:left-[-12px] lg:left-[-24px] lg:top-12">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <svg
              className="size-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.7}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={MACHINE_ICON} />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div
              className={`transition-all duration-300 ease-out ${
                fade ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
              }`}
            >
              <p className="text-sm font-semibold text-foreground truncate" title={current.topRole}>
                {current.topRole}
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/2 rounded-full bg-primary" />
            </div>
          </div>
        </div>
        <div
          className={`mt-2.5 flex items-baseline justify-between transition-all duration-300 ease-out ${
            fade ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
          }`}
        >
          <span className="text-xs text-muted-foreground truncate max-w-[190px]">
            {current.topModules}
          </span>
          <span className="text-xs font-semibold text-foreground shrink-0">50%</span>
        </div>
      </div>

      {/* Overlay 2: Bottom-left voice moment in worker's own vernacular language */}
      <div className="absolute -left-4 bottom-14 z-10 w-[300px] rounded-xl border border-border/80 bg-card p-4 shadow-[0_16px_40px_rgba(0,0,0,0.55)] sm:left-[-16px] lg:left-[-28px] lg:bottom-20">
        <div className="flex items-start gap-3">
          {/* Animated audio equalizer wave bars */}
          <span className="mt-1 flex items-end gap-[3px] shrink-0" aria-hidden>
            {[10, 18, 24, 14, 22, 12].map((h, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-[#5b9bd5] animate-pulse"
                style={{
                  height: h,
                  animationDelay: `${i * 150}ms`,
                  animationDuration: '1.2s',
                }}
              />
            ))}
          </span>

          <div className="min-w-0 flex-1">
            {/* Dynamic quote text changing in Indian languages */}
            <div
              className={`min-h-[44px] transition-all duration-300 ease-out ${
                fade ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
              }`}
            >
              <p className="text-sm font-semibold leading-snug text-foreground">
                {current.voiceQuestion}
              </p>
            </div>

            <div
              className={`mt-1.5 flex items-center justify-between gap-1 text-xs transition-all duration-300 ease-out ${
                fade ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <span className="text-muted-foreground truncate">{current.voiceInstructor}</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary shrink-0">
                {current.nativeName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay 3: Right card skill gap diagnosis */}
      <div className="absolute right-0 top-[52%] z-10 flex w-[250px] -translate-y-1/2 items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)] sm:right-[-4px] lg:right-[-12px]">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
          <svg
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <div
          className={`min-w-0 flex-1 transition-all duration-300 ease-out ${
            fade ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-1'
          }`}
        >
          <p className="text-sm font-semibold text-foreground truncate" title={current.skillTitle}>
            {current.skillTitle}
          </p>
          <p className="text-xs text-muted-foreground truncate" title={current.skillCategory}>
            {current.skillCategory}
          </p>
        </div>
        <span aria-hidden className="text-muted-foreground shrink-0">
          ›
        </span>
      </div>
    </>
  );
}
