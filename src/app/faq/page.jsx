export const metadata = {
  title: 'FAQ',
  description:
    'Frequently asked questions about QryptChat: is it free, what platforms it runs on, how post-quantum encryption works, whether you can self-host, and how it compares to Signal.',
  alternates: { canonical: '/faq' },
  openGraph: { url: '/faq', title: 'QryptChat FAQ' },
};

const faqs = [
  {
    q: 'Is QryptChat free?',
    a: 'Yes. QryptChat is free and open source under the MIT license. All core messaging, calling, and encryption features are available at no cost, and you can self-host it. An optional paid Premium tier is in development.',
  },
  {
    q: 'What platforms does QryptChat run on?',
    a: 'QryptChat runs in any modern web browser and installs as a Progressive Web App on Android, iOS, and desktop. It is also reachable as a Tor hidden service.',
  },
  {
    q: 'What makes QryptChat quantum-resistant?',
    a: 'QryptChat encrypts messages, files, and calls with NIST-approved post-quantum algorithms: ML-KEM-1024 (CRYSTALS-Kyber) for key encapsulation and CRYSTALS-Dilithium for digital signatures. These protect against "harvest now, decrypt later" attacks where traffic recorded today is decrypted once quantum computers exist.',
  },
  {
    q: 'How is QryptChat different from Signal?',
    a: 'Like Signal, QryptChat offers end-to-end encrypted messaging and calls with phone-number sign-up. The key difference is that QryptChat uses post-quantum cryptography (ML-KEM-1024 and CRYSTALS-Dilithium) by design, is MIT-licensed and self-hostable, and is accessible over Tor.',
  },
  {
    q: 'Does QryptChat require an email address or password?',
    a: 'No. You register with a phone number and a one-time SMS verification code. There is no password to leak and no email address to collect.',
  },
  {
    q: 'Can I self-host QryptChat?',
    a: 'Yes. QryptChat is open source and self-hostable. The full source code is available at github.com/profullstack/qryptchat-web.',
  },
  {
    q: 'Can QryptChat read my messages?',
    a: 'No. Encryption keys are generated on your device and never sent to our servers, so QryptChat operates on a zero-knowledge basis and only ever handles ciphertext.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

const containerStyle = { padding: '4rem 0', maxWidth: '760px' };

export default function FaqPage() {
  return (
    <div className="container" style={containerStyle}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1.5rem' }}>Frequently Asked Questions</h1>
      {faqs.map(({ q, a }) => (
        <section key={q} style={{ margin: '0 0 1.75rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{q}</h2>
          <p style={{ fontSize: '1.0625rem', lineHeight: 1.8, color: 'var(--color-text-secondary)', margin: 0 }}>{a}</p>
        </section>
      ))}
    </div>
  );
}
