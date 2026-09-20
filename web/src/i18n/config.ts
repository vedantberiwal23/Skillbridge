/**
 * Multilingual NAVIGATION, not just multilingual tutoring — language is the
 * primary adoption barrier for this workforce, not a preference.
 *
 * A working subset ships; the full scheduled-language set is roadmap.
 */
export const LOCALES = ['en', 'hi', 'mr'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
};

/** Maps a UI locale to the BCP-47 code the voice pipeline expects. */
export const VOICE_LANGUAGE: Record<Locale, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
};

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);

export interface IndianLanguage {
  code: string;
  name: string;
  native: string;
  glyph: string;
  region: string;
  desc: string;
  voiceCode: string;
}

/** Comprehensive catalog of languages spoken across India's industrial workforce. */
export const INDIAN_LANGUAGES: readonly IndianLanguage[] = [
  {
    code: 'hi',
    name: 'Hindi',
    native: 'हिन्दी',
    glyph: 'हि',
    region: 'North & Central India',
    desc: 'दुकान और कार्यशाला प्रशिक्षण एवं आवाज में सहायता',
    voiceCode: 'hi-IN',
  },
  {
    code: 'en',
    name: 'English',
    native: 'English',
    glyph: 'EN',
    region: 'Pan-India Industrial Standard',
    desc: 'Primary industrial vocabulary & standard terminology',
    voiceCode: 'en-IN',
  },
  {
    code: 'mr',
    name: 'Marathi',
    native: 'मराठी',
    glyph: 'म',
    region: 'Maharashtra Industrial Belt',
    desc: 'औद्योगिक प्रशिक्षण आणि हँड्स-फ्री ऑडिओ मार्गदर्शन',
    voiceCode: 'mr-IN',
  },
  {
    code: 'ta',
    name: 'Tamil',
    native: 'தமிழ்',
    glyph: 'த',
    region: 'Tamil Nadu Automotive & Machinery Hub',
    desc: 'தொழிற்சாலை பயிற்சி மற்றும் குரல் வழிகாட்டல்',
    voiceCode: 'ta-IN',
  },
  {
    code: 'te',
    name: 'Telugu',
    native: 'తెలుగు',
    glyph: 'తె',
    region: 'Telangana & Andhra Industrial Corridors',
    desc: 'పరిశ్రమల శిక్షణ మరియు వాయిస్ అసిస్టెన్స్',
    voiceCode: 'te-IN',
  },
  {
    code: 'kn',
    name: 'Kannada',
    native: 'ಕನ್ನಡ',
    glyph: 'ಕ',
    region: 'Karnataka Aerospace & Machine Tools',
    desc: 'ಕೈಗಾರಿಕಾ ತರಬೇತಿ ಮತ್ತು ಧ್ವನಿ ಮಾರ್ಗದರ್ಶನ',
    voiceCode: 'kn-IN',
  },
  {
    code: 'gu',
    name: 'Gujarati',
    native: 'ગુજરાતી',
    glyph: 'ગુ',
    region: 'Gujarat Heavy Engineering & Petrochemical',
    desc: 'ઔદ્યોગિક તાલીમ અને અવાજ માર્ગદર્શન',
    voiceCode: 'gu-IN',
  },
  {
    code: 'bn',
    name: 'Bengali',
    native: 'বাংলা',
    glyph: 'বা',
    region: 'West Bengal & Eastern Industrial Sector',
    desc: 'শিল্প প্রশিক্ষণ এবং ভয়েস সহায়তা',
    voiceCode: 'bn-IN',
  },
  {
    code: 'pa',
    name: 'Punjabi',
    native: 'ਪੰਜਾਬੀ',
    glyph: 'ਪੰ',
    region: 'Punjab Fabrication & Machinery Cluster',
    desc: 'ਉਦਯੋਗਿਕ ਸਿਖਲਾਈ ਅਤੇ ਆਵਾਜ਼ ਸਹਾਇਤਾ',
    voiceCode: 'pa-IN',
  },
  {
    code: 'ml',
    name: 'Malayalam',
    native: 'മലയാളം',
    glyph: 'മ',
    region: 'Kerala Precision & Tech Corridors',
    desc: 'വ്യാവസായിക പരിശീലനവും വോയ്‌സ് മാർഗ്ഗനിർദ്ദേശവും',
    voiceCode: 'ml-IN',
  },
  {
    code: 'or',
    name: 'Odia',
    native: 'ଓଡ଼ିଆ',
    glyph: 'ଓ',
    region: 'Odisha Mining & Metallurgy Manufacturing',
    desc: 'ଶିଳ୍ପ ତାଲିମ ଏବଂ ଭଏସ୍ ମାର୍ଗଦର୍ଶନ',
    // `od-IN`, not the ISO `or-IN`: that is the code Sarvam uses, and the voice
    // service accepts only codes it can actually speak. An unrecognised code is
    // not refused — it falls back to Hindi — so `or-IN` answered every Odia
    // speaker in Hindi with nothing on screen to say why.
    voiceCode: 'od-IN',
  },
  {
    code: 'as',
    name: 'Assamese',
    native: 'অসমীয়া',
    glyph: 'অ',
    region: 'Assam & Northeast Industrial Zone',
    desc: 'উদ্যোগিক প্ৰশিক্ষণ আৰু ভইচ সহায়',
    voiceCode: 'as-IN',
  },
  {
    code: 'ur',
    name: 'Urdu',
    native: 'اردو',
    glyph: 'ار',
    region: 'North & Deccan Manufacturing Centers',
    desc: 'صنعتی تربیت اور صوتی معاونت',
    voiceCode: 'ur-IN',
  },
  {
    code: 'bho',
    name: 'Bhojpuri',
    native: 'भोजपुरी',
    glyph: 'भो',
    region: 'Bihar & Purvanchal Industrial Workforce',
    desc: 'कारखाना प्रशिक्षण आ आवाज में पूरा मदद',
    voiceCode: 'hi-IN',
  },
  {
    code: 'mai',
    name: 'Maithili',
    native: 'मैथिली',
    glyph: 'मै',
    region: 'Bihar & Mithilanchal Region',
    desc: 'औद्योगिक प्रशिक्षण आ ध्वनि सहायता',
    voiceCode: 'hi-IN',
  },
  {
    code: 'raj',
    name: 'Marwari / Rajasthani',
    native: 'मारवाड़ी',
    glyph: 'मा',
    region: 'Rajasthan Mining & Heavy Engineering',
    desc: 'कारखाना प्रशिक्षण अर आवाज में सीखो',
    voiceCode: 'hi-IN',
  },
  {
    code: 'kok',
    name: 'Konkani',
    native: 'कोंकणी',
    glyph: 'कों',
    region: 'Goa & Konkan Coastal Industrial Hubs',
    desc: 'कारखान्यांतलें प्रशिक्षण आनी व्हॉइस मार्गदर्शन',
    voiceCode: 'mr-IN',
  },
  {
    code: 'ne',
    name: 'Nepali',
    native: 'नेपाली',
    glyph: 'ने',
    region: 'Himalayan Industrial & Hydroelectric Plants',
    desc: 'औद्योगिक तालिम र भ्वाइस सहायता',
    voiceCode: 'ne-NP',
  },
  {
    code: 'doi',
    name: 'Dogri',
    native: 'डोगरी',
    glyph: 'डो',
    region: 'Jammu & Northern Industrial Belts',
    desc: 'औद्योगिक प्रशिक्षण ते आवाज च मद्द',
    voiceCode: 'hi-IN',
  },
  {
    code: 'ks',
    name: 'Kashmiri',
    native: 'कॉशुर',
    glyph: 'کٲ',
    region: 'Jammu & Kashmir Craft & Manufacturing',
    desc: 'صنعتی تربیت تہٕ آواز ہُنٛد رہنمائی',
    voiceCode: 'ur-IN',
  },
  {
    code: 'sat',
    name: 'Santali',
    native: 'ᱥᱟᱱᱛᱟᱲᱤ',
    glyph: 'ᱥᱟ',
    region: 'Jharkhand, Odisha & Bengal Mining Belt',
    desc: 'ᱠᱟᱹᱨᱜᱟᱹᱲ ᱴᱨᱮᱱᱤᱝ ᱟᱨ ᱟᱲᱟᱝ ᱜᱚᱲᱚ',
    voiceCode: 'hi-IN',
  },
  {
    code: 'brx',
    name: 'Bodo',
    native: 'बड़ो',
    glyph: 'ब',
    region: 'Assam & Bodoland Industrial Area',
    desc: 'इन्डस्ट्रियेल ट्रेनिं आरो खोलो सहाय',
    voiceCode: 'as-IN',
  },
  {
    code: 'sd',
    name: 'Sindhi',
    native: 'सिंधी',
    glyph: 'सि',
    region: 'Western Manufacturing & Trade Hubs',
    desc: 'صنعتی تربيت ۽ آواز جي مدد',
    voiceCode: 'hi-IN',
  },
  {
    code: 'bgc',
    name: 'Haryanvi',
    native: 'हरियाणवी',
    glyph: 'ह',
    region: 'Haryana Automotive & Auto-Components Hub',
    desc: 'फैक्ट्री की ट्रेनिंग अर बोल के मदद',
    voiceCode: 'hi-IN',
  },
  {
    code: 'hne',
    name: 'Chhattisgarhi',
    native: 'छत्तीसगढ़ी',
    glyph: 'छ',
    region: 'Chhattisgarh Steel, Sponge Iron & Power Plants',
    desc: 'कारखाना ट्रेनिंग अउर आवाज म सहायता',
    voiceCode: 'hi-IN',
  },
  {
    code: 'mni',
    name: 'Manipuri',
    native: 'মৈতৈলোন্',
    glyph: 'মৈ',
    region: 'Manipur & Northeast Border Infrastructure',
    desc: 'ইন্ডাস্ট্রি ফ্রেনিং অমসুং খোঞ্জেলগী তেংবাং',
    voiceCode: 'as-IN',
  },
];

