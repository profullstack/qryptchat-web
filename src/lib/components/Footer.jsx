'use client';

const links = [
  { label: 'Security', href: '/security' },
  { label: 'About', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
  { label: 'Warrant Canary', href: '/warrant-canary' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'GitHub', href: 'https://github.com/profullstack/qryptchat-web' },
];

export default function Footer() {
  const onionUrl = process.env.NEXT_PUBLIC_ONION_URL;
  const isOnionSite = typeof window !== 'undefined' && window.location.hostname.endsWith('.onion');

  return (
    <footer className="footer">
      <nav className="footer-links" aria-label="Footer">
        {links.map((link) => (
          <a key={link.href} href={link.href}>{link.label}</a>
        ))}
      </nav>
      <p className="footer-copy">
        &copy; {new Date().getFullYear()} <a href="https://profullstack.com/">Profullstack, Inc.</a>
        {!isOnionSite && onionUrl && (
          <>
            {' · '}
            <a href={onionUrl} target="_blank" rel="noopener noreferrer">Tor .onion</a>
          </>
        )}
      </p>

      <style>{`
        .footer { background: var(--color-bg-secondary); border-top: 1px solid var(--color-border-primary); padding: var(--space-6) var(--space-6); display: flex; flex-direction: column; align-items: center; gap: var(--space-2); font-size: 0.875rem; color: var(--color-text-secondary); text-align: center; }
        .footer-links { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-2) var(--space-5); }
        .footer a { color: var(--color-text-secondary); text-decoration: none; transition: color .2s; }
        .footer a:hover { color: var(--color-brand-primary); }
        .footer-copy { margin: 0; }
      `}</style>
    </footer>
  );
}
