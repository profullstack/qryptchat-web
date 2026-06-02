'use client';

import { useI18nStore } from '@/lib/stores/i18n.js';

const socialLinks = [
  { name: 'Discord', url: 'https://discord.gg/w5nHdzpQ29' },
  { name: 'GitHub', url: 'https://github.com/profullstack' },
  { name: 'X (Twitter)', url: 'https://x.com/profullstackinc' },
  { name: 'Bluesky', url: 'https://bsky.app/profile/chovyfu.bsky.social' },
];

const currentYear = new Date().getFullYear();

export default function Footer() {
  const i18n = useI18nStore();
  const t = i18n.t.bind(i18n);
  const onionUrl = process.env.NEXT_PUBLIC_ONION_URL;
  const isOnionSite = typeof window !== 'undefined' && window.location.hostname.endsWith('.onion');

  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="brand-section">
          <div className="brand-header">
            <div className="logo">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="brand-name">QryptChat</span>
            </div>
          </div>
          <p className="brand-tagline">{t('app.tagline')}</p>
          {!isOnionSite && onionUrl && (
            <div className="onion-link">
              <span>🧅 Available on Tor:</span>
              <a href={onionUrl} className="onion-url" target="_blank" rel="noopener noreferrer">
                {onionUrl}
              </a>
            </div>
          )}
        </div>

        <div className="footer-links">
          <div className="link-section">
            <h4>Product</h4>
            <a href="/security">Security</a>
            <a href="/encryption-test">Encryption Test</a>
            <a href="/premium">Premium</a>
          </div>
          <div className="link-section">
            <h4>Company</h4>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
            <a href="/warrant-canary">Warrant Canary</a>
          </div>
          <div className="link-section">
            <h4>Legal</h4>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
          </div>
        </div>

        <div className="social-section">
          <h4>Connect</h4>
          <div className="social-links">
            {socialLinks.map((link) => (
              <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="social-link" aria-label={link.name}>
                {link.name}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© {currentYear} QryptChat. All rights reserved.</p>
      </div>

      <style>{`
        .footer { background: var(--color-bg-secondary); border-top: 1px solid var(--color-border-primary); padding: var(--space-12) 0 var(--space-6); }
        .footer-content { max-width: 1200px; margin: 0 auto; padding: 0 var(--space-6); display: grid; grid-template-columns: 2fr 2fr 1fr; gap: var(--space-8); }
        .brand-section .logo { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
        .brand-name { font-weight: 700; font-size: 1.125rem; color: var(--color-text-primary); }
        .brand-tagline { color: var(--color-text-secondary); font-size: 0.875rem; margin-bottom: var(--space-3); }
        .onion-link { font-size: 0.75rem; color: var(--color-text-secondary); }
        .onion-url { color: var(--color-brand-primary); word-break: break-all; }
        .footer-links { display: flex; gap: var(--space-8); }
        .link-section { display: flex; flex-direction: column; gap: var(--space-2); }
        .link-section h4 { font-weight: 600; font-size: 0.875rem; color: var(--color-text-primary); margin-bottom: var(--space-1); }
        .link-section a { color: var(--color-text-secondary); text-decoration: none; font-size: 0.875rem; transition: color .2s; }
        .link-section a:hover { color: var(--color-brand-primary); }
        .social-section h4 { font-weight: 600; font-size: 0.875rem; color: var(--color-text-primary); margin-bottom: var(--space-3); }
        .social-links { display: flex; flex-direction: column; gap: var(--space-2); }
        .social-link { color: var(--color-text-secondary); text-decoration: none; font-size: 0.875rem; transition: color .2s; }
        .social-link:hover { color: var(--color-brand-primary); }
        .footer-bottom { max-width: 1200px; margin: var(--space-8) auto 0; padding: var(--space-6) var(--space-6) 0; border-top: 1px solid var(--color-border-primary); }
        .footer-bottom p { color: var(--color-text-secondary); font-size: 0.875rem; }
        @media (max-width: 768px) {
          .footer-content { grid-template-columns: 1fr; }
          .footer-links { flex-direction: column; }
        }
      `}</style>
    </footer>
  );
}
