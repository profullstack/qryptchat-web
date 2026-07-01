export const metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of QryptChat.',
  alternates: { canonical: '/terms' },
  openGraph: { url: '/terms', title: 'QryptChat Terms of Service' },
};

export default function TermsPage() {
  return (
    <div className="container" style={{padding: '4rem 0', maxWidth: '720px'}}>
      <h1 style={{fontSize: '2rem', fontWeight: 800, marginBottom: '1.5rem'}}>Terms of Service</h1>
      <p>By using QryptChat you agree to use the service lawfully and not to violate the rights of others.</p>
    </div>
  );
}
