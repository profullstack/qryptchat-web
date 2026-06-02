'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useThemeStore, themeUtils, themes } from '@/lib/stores/theme.js';
import { useI18n } from '@/lib/hooks/useI18n.js';
import { languages } from '@/lib/stores/i18n.js';
import { useAuthStore } from '@/lib/stores/auth.js';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentTheme = useThemeStore((s) => s.currentTheme);
  const { t, currentLanguage, setLanguage } = useI18n();
  const { user, isAuthenticated, logout } = useAuthStore((s) => ({
    user: s.user,
    isAuthenticated: !!s.user,
    logout: s.logout,
  }));

  const currentLanguageInfo = languages[currentLanguage] || languages.en;

  useEffect(() => {
    function handleClickOutside(event) {
      if (!event.target?.closest?.('.dropdown')) {
        setThemeDropdownOpen(false);
        setLanguageDropdownOpen(false);
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    document.documentElement.classList.remove('mobile-menu-open');
  }

  function toggleMobileMenu() {
    const next = !mobileMenuOpen;
    setMobileMenuOpen(next);
    document.documentElement.classList.toggle('mobile-menu-open', next);
  }

  function switchTheme(name) {
    themeUtils.setTheme(name);
    setThemeDropdownOpen(false);
  }

  async function switchLanguage(code) {
    await setLanguage(code);
    setLanguageDropdownOpen(false);
  }

  async function handleLogout() {
    await logout();
    closeMobileMenu();
    router.push('/');
  }

  function goToProfile() {
    setUserDropdownOpen(false);
    if (user?.username) router.push(`/u/${user.username}`);
  }

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-content">
          <div className="navbar-brand">
            <Link href="/" className="brand-link" onClick={closeMobileMenu}>
              <img src="/logo.svg" alt="QryptChat" className="brand-logo" />
            </Link>
          </div>

          <div className="navbar-nav desktop-nav">
            <Link href="/" className={`nav-link${pathname === '/' ? ' active' : ''}`}>{t('nav.home')}</Link>
            {isAuthenticated && (
              <Link href="/chat" className={`nav-link${pathname === '/chat' ? ' active' : ''}`}>{t('nav.chat')}</Link>
            )}
          </div>

          <div className="navbar-actions desktop-actions">
            <div className={`dropdown${themeDropdownOpen ? ' open' : ''}`}>
              <button className="btn btn-ghost dropdown-trigger" onClick={(e) => { e.stopPropagation(); setThemeDropdownOpen(!themeDropdownOpen); }}>
                <span className="theme-icon">
                  {currentTheme === 'light' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  )}
                </span>
              </button>
              {themeDropdownOpen && (
                <div className="dropdown-content">
                  <button className={`dropdown-item${currentTheme === 'light' ? ' active' : ''}`} onClick={() => switchTheme('light')}>Light</button>
                  <button className={`dropdown-item${currentTheme === 'dark' ? ' active' : ''}`} onClick={() => switchTheme('dark')}>Dark</button>
                </div>
              )}
            </div>

            <div className={`dropdown${languageDropdownOpen ? ' open' : ''}`}>
              <button className="btn btn-ghost dropdown-trigger" onClick={(e) => { e.stopPropagation(); setLanguageDropdownOpen(!languageDropdownOpen); }}>
                <span className="language-flag">{currentLanguageInfo.flag}</span>
                <span className="language-code">{currentLanguage.toUpperCase()}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
              </button>
              {languageDropdownOpen && (
                <div className="dropdown-content language-dropdown">
                  {Object.entries(languages).map(([code, lang]) => (
                    <button key={code} className={`dropdown-item${currentLanguage === code ? ' active' : ''}`} onClick={() => switchLanguage(code)}>
                      <span>{lang.flag}</span><span className="language-name">{lang.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="auth-actions">
              {isAuthenticated ? (
                <div className={`dropdown user-dropdown${userDropdownOpen ? ' open' : ''}`}>
                  <button className="btn btn-ghost dropdown-trigger user-trigger" onClick={(e) => { e.stopPropagation(); setUserDropdownOpen(!userDropdownOpen); }}>
                    <div className="user-avatar">
                      {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.displayName} />
                      ) : (
                        <div className="avatar-placeholder">{(user?.displayName || user?.username || 'U').charAt(0).toUpperCase()}</div>
                      )}
                    </div>
                    <span className="user-name">{user?.displayName || user?.username}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>
                  </button>
                  {userDropdownOpen && (
                    <div className="dropdown-content user-dropdown-content">
                      <button className="dropdown-item" onClick={goToProfile}>Profile</button>
                      <button className="dropdown-item" onClick={() => { setUserDropdownOpen(false); router.push('/settings'); }}>Settings</button>
                      <button className="dropdown-item premium-item" onClick={() => { setUserDropdownOpen(false); router.push('/premium'); }}>Upgrade to Premium</button>
                      <div className="dropdown-divider" />
                      <button className="dropdown-item logout-item" onClick={handleLogout}>{t('nav.logout')}</button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <button className="btn btn-ghost" onClick={() => router.push('/auth')}>{t('nav.login')}</button>
                  <button className="btn btn-primary" onClick={() => router.push('/auth')}>{t('nav.register')}</button>
                </>
              )}
            </div>
          </div>

          <button className={`mobile-menu-btn${mobileMenuOpen ? ' active' : ''}`} onClick={toggleMobileMenu} aria-label="Toggle mobile menu">
            <span className="hamburger-line" /><span className="hamburger-line" /><span className="hamburger-line" />
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="mobile-menu fade-in">
            <div className="mobile-nav">
              <Link href="/" className="mobile-nav-link" onClick={closeMobileMenu}>{t('nav.home')}</Link>
              {isAuthenticated && (
                <>
                  <Link href="/chat" className="mobile-nav-link" onClick={closeMobileMenu}>{t('nav.chat')}</Link>
                  {user?.username && <Link href={`/u/${user.username}`} className="mobile-nav-link" onClick={closeMobileMenu}>Profile</Link>}
                  <Link href="/settings" className="mobile-nav-link" onClick={closeMobileMenu}>{t('nav.settings')}</Link>
                </>
              )}
            </div>
            <div className="mobile-actions">
              <div className="mobile-action-group">
                <span className="mobile-action-label">{t('theme.switch')}</span>
                <div className="theme-buttons">
                  <button className={`theme-btn${currentTheme === 'light' ? ' active' : ''}`} onClick={() => switchTheme('light')}>Light</button>
                  <button className={`theme-btn${currentTheme === 'dark' ? ' active' : ''}`} onClick={() => switchTheme('dark')}>Dark</button>
                </div>
              </div>
              <div className="mobile-action-group">
                <span className="mobile-action-label">{t('language.switch')}</span>
                <div className="language-grid">
                  {Object.entries(languages).map(([code, lang]) => (
                    <button key={code} className={`language-btn${currentLanguage === code ? ' active' : ''}`} onClick={() => switchLanguage(code)}>
                      <span>{lang.flag}</span><span className="language-name">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mobile-auth-actions">
                {isAuthenticated ? (
                  <button className="btn btn-error" onClick={handleLogout}>{t('nav.logout')}</button>
                ) : (
                  <>
                    <button className="btn btn-secondary" onClick={() => { router.push('/auth'); closeMobileMenu(); }}>{t('nav.login')}</button>
                    <button className="btn btn-primary" onClick={() => { router.push('/auth'); closeMobileMenu(); }}>{t('nav.register')}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .navbar { position: sticky; top: 0; z-index: 40; background-color: var(--color-bg-primary); border-bottom: 1px solid var(--color-border-primary); box-shadow: 0 1px 3px rgba(0,0,0,.1); }
        .navbar-content { display: flex; align-items: center; justify-content: space-between; height: 4rem; }
        .brand-link { display: flex; align-items: center; gap: var(--space-3); text-decoration: none; }
        .brand-logo { height: 40px; width: auto; }
        .desktop-nav { display: none; align-items: center; gap: var(--space-6); }
        .nav-link { color: var(--color-text-secondary); text-decoration: none; font-weight: 500; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); transition: all .2s ease; }
        .nav-link:hover, .nav-link.active { color: var(--color-text-primary); background-color: var(--color-bg-secondary); }
        .desktop-actions { display: none; align-items: center; gap: var(--space-3); }
        .dropdown { position: relative; }
        .dropdown-trigger { display: flex; align-items: center; gap: var(--space-2); }
        .language-flag { display: flex; align-items: center; }
        .language-code { font-size: .75rem; font-weight: 600; letter-spacing: .05em; }
        .dropdown-content { position: absolute; top: calc(100% + 4px); left: 0; z-index: 50; background: var(--color-bg-primary); border: 1px solid var(--color-border-primary); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); min-width: 8rem; overflow: hidden; }
        .language-dropdown { min-width: 10rem; }
        .dropdown-item { display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); color: var(--color-text-primary); text-decoration: none; font-size: .875rem; border: none; background: none; cursor: pointer; transition: background-color .2s ease; white-space: nowrap; }
        .dropdown-item:hover { background-color: var(--color-bg-secondary); }
        .dropdown-item.active { background-color: var(--color-brand-primary); color: white; }
        .language-name { flex: 1; text-align: left; }
        .auth-actions { display: flex; align-items: center; gap: var(--space-2); }
        .user-dropdown { position: relative; }
        .user-trigger { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); }
        .user-avatar { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex-shrink: 0; }
        .user-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-placeholder { width: 100%; height: 100%; background: var(--color-brand-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: .875rem; }
        .user-name { font-size: .875rem; font-weight: 500; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .user-dropdown-content { right: 0; left: auto; min-width: 200px; }
        .dropdown-divider { height: 1px; background-color: var(--color-border-primary); margin: var(--space-2) 0; }
        .premium-item { color: var(--color-brand-primary); font-weight: 500; }
        .premium-item:hover { background-color: var(--color-brand-primary); color: white; }
        .logout-item { color: var(--color-error); }
        .logout-item:hover { background-color: var(--color-error); color: white; }
        .mobile-menu-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; background: none; border: none; cursor: pointer; gap: .25rem; }
        .hamburger-line { width: 1.25rem; height: 2px; background-color: var(--color-text-primary); transition: all .2s ease; transform-origin: center; }
        .mobile-menu-btn.active .hamburger-line:nth-child(1) { transform: rotate(45deg) translate(.25rem, .25rem); }
        .mobile-menu-btn.active .hamburger-line:nth-child(2) { opacity: 0; }
        .mobile-menu-btn.active .hamburger-line:nth-child(3) { transform: rotate(-45deg) translate(.25rem, -.25rem); }
        .mobile-menu { padding: var(--space-4); background-color: var(--color-bg-primary); border-bottom: 1px solid var(--color-border-primary); }
        .mobile-nav { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-6); }
        .mobile-nav-link { color: var(--color-text-primary); text-decoration: none; font-weight: 500; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); }
        .mobile-nav-link:hover { background-color: var(--color-bg-secondary); }
        .mobile-actions { display: flex; flex-direction: column; gap: var(--space-6); }
        .mobile-action-group { display: flex; flex-direction: column; gap: var(--space-3); }
        .mobile-action-label { font-size: .875rem; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: .05em; }
        .theme-buttons { display: flex; gap: var(--space-2); }
        .theme-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); background-color: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border-primary); border-radius: var(--radius-md); font-size: .875rem; font-weight: 500; cursor: pointer; }
        .theme-btn.active { background-color: var(--color-brand-primary); color: white; border-color: var(--color-brand-primary); }
        .language-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
        .language-btn { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3); background-color: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border-primary); border-radius: var(--radius-md); font-size: .875rem; cursor: pointer; }
        .language-btn.active { background-color: var(--color-brand-primary); color: white; border-color: var(--color-brand-primary); }
        .mobile-auth-actions { display: flex; flex-direction: column; gap: var(--space-3); }
        .mobile-auth-actions .btn { justify-content: center; }
        @media (min-width: 768px) {
          .desktop-nav, .desktop-actions { display: flex; }
          .mobile-menu-btn { display: none; }
        }
      `}</style>
    </nav>
  );
}
