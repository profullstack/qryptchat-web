'use client';

// One footer row: links, copyright and the Profullstack ring come from
// @profullstack/footer, server-rendered in app/layout.jsx and passed in as
// `bottom`. The Tor mirror link sits just above it when configured.
export default function Footer({ bottom }) {
  const onionUrl = process.env.NEXT_PUBLIC_ONION_URL;
  const isOnionSite = typeof window !== 'undefined' && window.location.hostname.endsWith('.onion');

  return (
    <footer className="footer">
      {!isOnionSite && onionUrl && (
        <p className="footer-onion">
          🧅 Also on Tor: <a href={onionUrl} target="_blank" rel="noopener noreferrer">{onionUrl}</a>
        </p>
      )}
      {bottom}

      <style>{`
        .footer { background: var(--color-bg-secondary); border-top: 1px solid var(--color-border-primary); color: var(--color-text-secondary); }
        .footer-onion { margin: 0; padding-top: var(--space-4); text-align: center; font-size: 0.75rem; word-break: break-all; }
        .footer-onion a { color: var(--color-brand-primary); }
      `}</style>
    </footer>
  );
}
