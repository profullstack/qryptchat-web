export const metadata = {
  title: 'Pricing & Premium',
  description:
    'QryptChat is free and open source. See what is included for free and what is coming to QryptChat Premium.',
  alternates: { canonical: '/premium' },
  openGraph: { url: '/premium', title: 'QryptChat Pricing & Premium' },
};

const containerStyle = { padding: '4rem 0', maxWidth: '760px' };
const cellStyle = { border: '1px solid var(--color-border)', padding: '0.6rem 0.9rem', textAlign: 'left', fontSize: '0.95rem' };
const thStyle = { ...cellStyle, background: 'var(--color-bg-secondary)', fontWeight: 600 };

export default function PremiumPage() {
  return (
    <div className="container" style={containerStyle}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem' }}>Pricing &amp; Premium</h1>
      <p style={{ fontSize: '1.125rem', lineHeight: 1.7, color: 'var(--color-text-secondary)', margin: '0 0 2rem' }}>
        QryptChat is <strong>free and open source (MIT)</strong>. Every core messaging, calling, and
        encryption feature is available at no cost, and you can always self-host from the{' '}
        <a href="https://github.com/profullstack/qryptchat-web" target="_blank" rel="noopener noreferrer">source repository</a>.
        Premium is an optional paid tier for power users — it is in development.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 2rem' }}>
        <caption style={{ textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          QryptChat plans
        </caption>
        <thead>
          <tr>
            <th scope="col" style={thStyle}>Feature</th>
            <th scope="col" style={thStyle}>Free</th>
            <th scope="col" style={thStyle}>Premium (coming soon)</th>
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row" style={cellStyle}>Post-quantum end-to-end encryption</th><td style={cellStyle}>✓</td><td style={cellStyle}>✓</td></tr>
          <tr><th scope="row" style={cellStyle}>Encrypted voice &amp; video calls</th><td style={cellStyle}>✓</td><td style={cellStyle}>✓</td></tr>
          <tr><th scope="row" style={cellStyle}>Disappearing messages &amp; file sharing</th><td style={cellStyle}>✓</td><td style={cellStyle}>✓</td></tr>
          <tr><th scope="row" style={cellStyle}>Tor access &amp; self-hosting</th><td style={cellStyle}>✓</td><td style={cellStyle}>✓</td></tr>
          <tr><th scope="row" style={cellStyle}>Price</th><td style={cellStyle}>$0 forever</td><td style={cellStyle}>TBA</td></tr>
        </tbody>
      </table>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
        Want early access or have a use case in mind? <a href="/contact">Contact us</a>.
      </p>
    </div>
  );
}
