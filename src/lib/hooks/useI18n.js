'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { currentLanguage, _translations, i18nUtils, languages } from '@/lib/stores/i18n.js';

// Subscribe to a Svelte store and return the current value reactively
function useSvelteStore(store, initialValue) {
  const subscribe = useCallback(
    (callback) => store.subscribe(() => callback()),
    [store]
  );

  const getSnapshot = () => {
    let val = initialValue;
    const unsub = store.subscribe((v) => { val = v; });
    unsub();
    return val;
  };

  const getServerSnapshot = () => initialValue;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useI18n() {
  const lang = useSvelteStore(currentLanguage, 'en');
  const translations = useSvelteStore(_translations, {});

  function t(key, params = {}) {
    const current = (translations[lang] || translations['en'] || {});
    let text = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : key;
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([p, v]) => {
        text = text.replace(new RegExp(`{{\\s*${p}\\s*}}`, 'g'), String(v));
      });
    }
    return text;
  }

  return {
    t,
    currentLanguage: lang,
    setLanguage: i18nUtils.setLanguage.bind(i18nUtils),
    languages,
  };
}
