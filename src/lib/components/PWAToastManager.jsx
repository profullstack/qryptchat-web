'use client';

import { useState, useEffect } from 'react';

export default function PWAToastManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);
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

  function handleUpdate() {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setUpdateAvailable(false);
      window.location.reload();
    }
  }

  if (!updateAvailable) return null;

  return (
    <div className="pwa-toast">
      <span>A new version is available!</span>
      <button onClick={handleUpdate}>Update</button>
      <style>{`
        .pwa-toast { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); background: var(--color-brand-primary); color: white; padding: .75rem 1.25rem; border-radius: .5rem; display: flex; align-items: center; gap: 1rem; z-index: 9999; box-shadow: var(--shadow-lg); }
        .pwa-toast button { background: white; color: var(--color-brand-primary); border: none; padding: .25rem .75rem; border-radius: .25rem; cursor: pointer; font-weight: 600; }
      `}</style>
    </div>
  );
}
