export const metadata = {
  title: 'Warrant Canary',
  description: 'QryptChat warrant canary — our transparency statement regarding government data requests and gag orders.',
  alternates: { canonical: '/warrant-canary' },
  openGraph: { url: '/warrant-canary', title: 'QryptChat Warrant Canary' },
};

export default function WarrantCanaryPage() {
  return (
    <div className="container" style={{padding: '4rem 0', maxWidth: '720px'}}>
      <h1 style={{fontSize: '2rem', fontWeight: 800, marginBottom: '1.5rem'}}>Warrant Canary</h1>
      <p>As of the last update of this page, QryptChat has not received any national security letters, gag orders, or warrants that would prevent us from discussing them.</p>
      <p style={{marginTop: '1rem', color: 'var(--color-text-secondary)', fontSize: '.875rem'}}>Last updated: 2026-06-01</p>
    </div>
  );
}
