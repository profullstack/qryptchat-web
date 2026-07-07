export const metadata = {
  title: 'Privacy Policy',
  description: 'QryptChat privacy policy: end-to-end encryption, data minimization, GDPR rights, and privacy-preserving advertising shown only to logged-out visitors on the public blog.',
  alternates: { canonical: '/privacy' },
  openGraph: { url: '/privacy', title: 'QryptChat Privacy Policy' },
};

const section = { marginTop: '2rem' };
const h2 = { fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' };
const p = { marginBottom: '0.75rem', lineHeight: 1.7 };

export default function PrivacyPage() {
  return (
    <div className="container" style={{ padding: '4rem 0', maxWidth: '720px' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Privacy Policy</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Last updated: July 7, 2026</p>

      <p style={p}>QryptChat collects minimal data. Your messages are end-to-end encrypted and we cannot read them. We do not sell your data.</p>

      <section style={section}>
        <h2 style={h2}>Advertising</h2>
        <p style={p}>
          We show advertising only to <strong>logged-out visitors</strong>, and only on our public blog
          (<code>/blog</code>). If you are signed in to a QryptChat account, <strong>no advertising is ever
          loaded or displayed to you</strong>.
        </p>
        <p style={p}>
          Our own pages load <strong>no third-party advertising JavaScript</strong>. When an ad is shown, it is
          rendered inside an isolated, sandboxed cross-origin <code>&lt;iframe&gt;</code> served by our advertising
          partner, CrawlProof (<code>crawlproof.com</code>). Because the ad is confined to that iframe, its code
          cannot access QryptChat&rsquo;s pages, your account, your cookies, or your encrypted messages.
        </p>
        <p style={p}>
          Ads are not personalized using your account or message content. When your browser loads the ad iframe,
          CrawlProof may receive standard request information (such as your IP address and approximate location,
          and basic browser/device type) in order to serve and measure the ad. This processing is governed by
          CrawlProof&rsquo;s own privacy policy.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>What we do not do</h2>
        <p style={p}>
          We do not sell your personal data, we do not use cross-site advertising trackers on our own pages, and
          we never serve ads inside the encrypted messaging application or to signed-in users.
        </p>
      </section>
    </div>
  );
}
