'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '@/lib/stores/chat.js';
import { isBusy, isStale, liveBuild, updateAction } from '@/lib/app-update.js';

const CHECK_EVERY_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 20 * 1000;

function reload(registration) {
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  window.location.reload();
}

export default function PWAToastManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registration = useRef(null);
  const lastCheck = useRef(0);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        registration.current = reg;
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
              }
            });
          }
        });
      });
    }
  }, []);

  // A new deploy, found by build id: see src/lib/app-update.js.
  useEffect(() => {
    let cancelled = false;

    async function check(resumed) {
      if (Date.now() - lastCheck.current < (resumed ? 2000 : MIN_GAP_MS)) return;
      lastCheck.current = Date.now();
      const live = await liveBuild();
      if (cancelled) return;
      const busy = isBusy() || !!useChatStore.getState().activeCall;
      const action = updateAction({ stale: isStale(live), resumed, busy });
      if (action === 'reload') reload(registration.current);
      else if (action === 'offer') setUpdateAvailable(true);
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') check(true);
    };
    const onPageShow = (e) => {
      if (e.persisted) check(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') check(false);
    }, CHECK_EVERY_MS);
    check(false);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      clearInterval(timer);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="pwa-toast" role="status">
      <span>A new version is available!</span>
      <button onClick={() => reload(registration.current)}>Update</button>
      <style>{`
        .pwa-toast { position: fixed; bottom: calc(1rem + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); background: var(--color-brand-primary); color: white; padding: .75rem 1.25rem; border-radius: .5rem; display: flex; align-items: center; gap: 1rem; z-index: 9999; box-shadow: var(--shadow-lg); max-width: calc(100vw - 2rem); }
        .pwa-toast button { background: white; color: var(--color-brand-primary); border: none; padding: .25rem .75rem; border-radius: .25rem; cursor: pointer; font-weight: 600; }
      `}</style>
    </div>
  );
}
