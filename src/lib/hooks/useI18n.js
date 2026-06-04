'use client';

import { useI18nStore, languages } from '@/lib/stores/i18n.js';

export function useI18n() {
  const currentLanguage = useI18nStore((s) => s.currentLanguage);
  const translations = useI18nStore((s) => s.translations);
  const setLanguage = useI18nStore((s) => s.setLanguage);

  function t(key, params = {}) {
    const dict = translations[currentLanguage] || translations['en'] || {};
    let text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([p, v]) => {
        text = text.replace(new RegExp(`{{\\s*${p}\\s*}}`, 'g'), String(v));
      });
    }
    return text;
  }

  return { t, currentLanguage, setLanguage, languages };
}
