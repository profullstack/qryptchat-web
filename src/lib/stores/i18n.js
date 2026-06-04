import { create } from 'zustand';
import enTranslations from '../locales/en.js';

export const languages = {
  en: { name: 'English', flag: '🇺🇸', rtl: false },
  es: { name: 'Español', flag: '🇪🇸', rtl: false },
  fr: { name: 'Français', flag: '🇫🇷', rtl: false },
  de: { name: 'Deutsch', flag: '🇩🇪', rtl: false },
  ar: { name: 'العربية', flag: '🇸🇦', rtl: true },
  zh: { name: '中文', flag: '🇨🇳', rtl: false },
};

const translationCache = new Map([['en', enTranslations]]);

async function loadTranslations(languageCode) {
  if (translationCache.has(languageCode)) return translationCache.get(languageCode);
  try {
    const module = await import(`../locales/${languageCode}.js`);
    const translations = module.default;
    if (!translations) throw new Error('No default export');
    translationCache.set(languageCode, translations);
    return translations;
  } catch {
    translationCache.set(languageCode, enTranslations);
    return enTranslations;
  }
}

// Always start with 'en' for SSR consistency; ClientLayout applies stored lang post-mount.
export const useI18nStore = create((set, get) => ({
  currentLanguage: 'en',
  translations: { en: enTranslations },

  async setLanguage(languageCode) {
    if (!languages[languageCode]) return;
    const trans = await loadTranslations(languageCode);
    set((prev) => ({
      currentLanguage: languageCode,
      translations: { ...prev.translations, [languageCode]: trans },
    }));
    if (typeof window !== 'undefined') {
      localStorage.setItem('qrypt-language', languageCode);
      document.documentElement.setAttribute('lang', languageCode);
      document.documentElement.setAttribute('dir', languages[languageCode].rtl ? 'rtl' : 'ltr');
      document.documentElement.setAttribute('data-language', languageCode);
    }
  },
}));

export const i18nUtils = {
  setLanguage: (code) => useI18nStore.getState().setLanguage(code),
  applyLanguage(languageCode) {
    if (typeof window === 'undefined' || !languages[languageCode]) return;
    const lang = languages[languageCode];
    document.documentElement.setAttribute('lang', languageCode);
    document.documentElement.setAttribute('dir', lang.rtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('data-language', languageCode);
  },
};
