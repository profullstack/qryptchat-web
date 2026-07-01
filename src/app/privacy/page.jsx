export const metadata = {
  title: 'Privacy Policy',
  description: 'QryptChat privacy policy: data minimization, GDPR rights, and no ads or third-party advertising trackers.',
  alternates: { canonical: '/privacy' },
  openGraph: { url: '/privacy', title: 'QryptChat Privacy Policy' },
};

export default function PrivacyPage() {
  return (
    <div className="container" style={{padding: '4rem 0', maxWidth: '720px'}}>
      <h1 style={{fontSize: '2rem', fontWeight: 800, marginBottom: '1.5rem'}}>Privacy Policy</h1>
      <p>QryptChat collects minimal data. Your messages are end-to-end encrypted and we cannot read them. We do not sell your data.</p>
    </div>
  );
}
