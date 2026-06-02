import { writable, derived } from 'svelte/store';
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

function getInitialLanguage() {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('qrypt-language');
  if (stored && languages[stored]) return stored;
  const browserLang = navigator.language.split('-')[0];
  if (languages[browserLang]) return browserLang;
  return 'en';
}

async function loadTranslations(languageCode) {
  if (translationCache.has(languageCode)) return translationCache.get(languageCode);
  try {
    const module = await import(`../locales/${languageCode}.js`);
    const translations = module.default;
    if (!translations) throw new Error('No default export');
    translationCache.set(languageCode, translations);
    return translations;
  } catch {
    if (languageCode !== 'en') {
      translationCache.set(languageCode, enTranslations);
      return enTranslations;
    }
    return enTranslations;
  }
}

// Svelte writable store for the current language code
export const currentLanguage = writable(
  typeof window === 'undefined' ? 'en' : getInitialLanguage()
);

// Svelte writable store holding all loaded translation objects keyed by language code
export const _translations = writable({ en: enTranslations });

// Svelte derived store: a (key, params?) => string function
export const t = derived(
  [currentLanguage, _translations],
  ([$currentLanguage, $translations]) => {
    return function translate(key, params = {}) {
      const current = $translations[$currentLanguage] || $translations['en'] || {};
      let translation = Object.prototype.hasOwnProperty.call(current, key)
        ? current[key]
        : key;
      if (params && typeof params === 'object') {
        Object.entries(params).forEach(([p, v]) => {
          translation = translation.replace(new RegExp(`{{\\s*${p}\\s*}}`, 'g'), String(v));
        });
      }
      return translation;
    };
  }
);

export const i18nUtils = {
  applyLanguage(languageCode) {
    if (typeof window === 'undefined' || !languages[languageCode]) return;
    const lang = languages[languageCode];
    document.documentElement.setAttribute('lang', languageCode);
    document.documentElement.setAttribute('dir', lang.rtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('data-language', languageCode);
  },

  async setLanguage(languageCode) {
    if (!languages[languageCode]) return;
    const trans = await loadTranslations(languageCode);
    _translations.update((prev) => ({ ...prev, [languageCode]: trans }));
    currentLanguage.set(languageCode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('qrypt-language', languageCode);
      i18nUtils.applyLanguage(languageCode);
    }
  },
};

// Shim: keep useI18nStore export for any legacy references.
// Returns a zustand-like snapshot object; not reactive but prevents import errors.
export const useI18nStore = () => {
  let $lang = 'en';
  let $trans = { en: enTranslations };
  currentLanguage.subscribe((v) => ($lang = v))();
  _translations.subscribe((v) => ($trans = v))();

  return {
    currentLanguage: $lang,
    translations: $trans,
    t(key, params = {}) {
      const current = $trans[$lang] || $trans['en'] || {};
      let translation = Object.prototype.hasOwnProperty.call(current, key)
        ? current[key]
        : key;
      if (params && typeof params === 'object') {
        Object.entries(params).forEach(([p, v]) => {
          translation = translation.replace(new RegExp(`{{\\s*${p}\\s*}}`, 'g'), String(v));
        });
      }
      return translation;
    },
    setLanguage: i18nUtils.setLanguage.bind(i18nUtils),
    init: async () => {
      const lang = $lang;
      const trans = await loadTranslations(lang);
      _translations.update((prev) => ({ ...prev, [lang]: trans }));
      if (typeof window !== 'undefined') {
        i18nUtils.applyLanguage(lang);
      }
    },
  };
};
