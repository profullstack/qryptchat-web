'use client';

import { useSyncExternalStore, useCallback, useRef } from 'react';
import { currentLanguage, _translations, i18nUtils, languages } from '@/lib/stores/i18n.js';

// Stable subscription factories — one per store, stable across renders
const subscribeLang = (callback) => {
  const unsub = currentLanguage.subscribe(() => callback());
  return unsub;
};
const subscribeTrans = (callback) => {
  const unsub = _translations.subscribe(() => callback());
  return unsub;
};

function getStoreLang() {
  let val = 'en';
  const unsub = currentLanguage.subscribe((v) => { val = v; });
  unsub();
  return val;
}

function getStoreTrans() {
  let val = {};
  const unsub = _translations.subscribe((v) => { val = v; });
  unsub();
  return val;
}

export function useI18n() {
  const lang = useSyncExternalStore(subscribeLang, getStoreLang, () => 'en');
  const translations = useSyncExternalStore(subscribeTrans, getStoreTrans, () => ({}));

  // Keep a stable t() that only re-creates when lang or translations identity changes
  const langRef = useRef(null);
  const transRef = useRef(null);
  const tRef = useRef(null);

  if (langRef.current !== lang || transRef.current !== translations) {
    langRef.current = lang;
    transRef.current = translations;
    tRef.current = function t(key, params = {}) {
      const dict = translations[lang] || translations['en'] || {};
      let text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
      if (params && typeof params === 'object') {
        Object.entries(params).forEach(([p, v]) => {
          text = text.replace(new RegExp(`{{\\s*${p}\\s*}}`, 'g'), String(v));
        });
      }
      return text;
    };
  }

  return {
    t: tRef.current,
    currentLanguage: lang,
    setLanguage: i18nUtils.setLanguage.bind(i18nUtils),
    languages,
  };
}
