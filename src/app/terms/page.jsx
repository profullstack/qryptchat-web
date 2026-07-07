export const metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of QryptChat.',
  alternates: { canonical: '/terms' },
  openGraph: { url: '/terms', title: 'QryptChat Terms of Service' },
};

const section = { marginTop: '2rem' };
const h2 = { fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' };
const p = { marginBottom: '0.75rem', lineHeight: 1.7 };

export default function TermsPage() {
  return (
    <div className="container" style={{ padding: '4rem 0', maxWidth: '720px' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Terms of Service</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Last updated: July 7, 2026</p>

      <p style={p}>By using QryptChat you agree to use the service lawfully and not to violate the rights of others.</p>

      <section style={section}>
        <h2 style={h2}>Advertising</h2>
        <p style={p}>
          Our public blog may display third-party advertising to logged-out visitors, delivered through our
          advertising partner CrawlProof inside an isolated, sandboxed iframe. Signed-in users are not shown ads,
          and no third-party advertising code runs on QryptChat&rsquo;s own pages. Advertisements are provided
          &ldquo;as is&rdquo;; the products or services they promote are the responsibility of the advertiser, and
          we do not endorse them. Interfering with, defrauding, or automating interactions with the advertising
          (including generating invalid clicks or impressions) is prohibited.
        </p>
      </section>
    </div>
  );
}
