'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useThemeStore, themeUtils } from '@/lib/stores/theme.js';
import { useI18nStore, i18nUtils } from '@/lib/stores/i18n.js';
import Navbar from '@/lib/components/Navbar.jsx';
import Footer from '@/lib/components/Footer.jsx';
import PWAToastManager from '@/lib/components/PWAToastManager.jsx';
import IncomingCallModal from '@/lib/components/voice-call/IncomingCallModal.jsx';
import ActiveCallInterface from '@/lib/components/voice-call/ActiveCallInterface.jsx';

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const i18nStore = useI18nStore();
  const shouldShowFooter = pathname !== '/chat';

  useEffect(() => {
    let theme = localStorage.getItem('qrypt-theme');
    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    themeUtils.setTheme(theme);
    i18nStore.init();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('Service worker registered', reg.scope))
        .catch((err) => console.error('SW registration failed', err));
    }
  }, []);

  useEffect(() => {
    themeUtils.applyTheme(currentTheme);
  }, [currentTheme]);

  return (
    <div className="app">
      <Navbar />
      <main className="main-content">{children}</main>
      {shouldShowFooter && <Footer />}
      <PWAToastManager />
      <IncomingCallModal />
      <ActiveCallInterface />
      <style>{`
        .app {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          padding-top: env(safe-area-inset-top);
          padding-left: env(safe-area-inset-left);
          padding-right: env(safe-area-inset-right);
          background: var(--color-bg-primary);
        }
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </div>
  );
}
