'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useThemeStore, themeUtils } from '@/lib/stores/theme.js';
import { useI18n } from '@/lib/hooks/useI18n.js';
import { i18nUtils, languages } from '@/lib/stores/i18n.js';
import Navbar from '@/lib/components/Navbar.jsx';
import Footer from '@/lib/components/Footer.jsx';
import PWAToastManager from '@/lib/components/PWAToastManager.jsx';
import IncomingCallModal from '@/lib/components/voice-call/IncomingCallModal.jsx';
import ActiveCallInterface from '@/lib/components/voice-call/ActiveCallInterface.jsx';

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const { t: _t } = useI18n();
  const shouldShowFooter = pathname !== '/chat';
  // Prevent hydration mismatch: don't render client-only UI until mounted
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Apply stored or system theme
    let theme = localStorage.getItem('qrypt-theme');
    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    themeUtils.setTheme(theme);

    // Apply stored or browser language (non-English only — 'en' is already loaded)
    const storedLang = localStorage.getItem('qrypt-language');
    const browserLang = navigator.language.split('-')[0];
    const lang = (storedLang && languages[storedLang]) ? storedLang
                : (languages[browserLang] ? browserLang : 'en');
    if (lang !== 'en') {
      i18nUtils.setLanguage(lang);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('Service worker registered', reg.scope))
        .catch((err) => console.error('SW registration failed', err));
    }
  }, []);

  useEffect(() => {
    if (mounted) themeUtils.applyTheme(currentTheme);
  }, [currentTheme, mounted]);

  return (
    <div className="app" suppressHydrationWarning>
      <Navbar />
      <main className="main-content">{children}</main>
      {shouldShowFooter && <Footer />}
      {mounted && (
        <>
          <PWAToastManager />
          <IncomingCallModal />
          <ActiveCallInterface />
        </>
      )}
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
