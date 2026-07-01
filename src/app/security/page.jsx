export const metadata = {
  title: 'Security',
  description:
    'How QryptChat protects your messages: ML-KEM-1024 (CRYSTALS-Kyber) key encapsulation, CRYSTALS-Dilithium signatures, on-device keys, a zero-knowledge architecture, Tor access, and responsible disclosure.',
  alternates: { canonical: '/security' },
  openGraph: { url: '/security', title: 'QryptChat Security' },
};

const containerStyle = { padding: '4rem 0', maxWidth: '760px' };
const paraStyle = { fontSize: '1.0625rem', lineHeight: 1.8, color: 'var(--color-text-secondary)', margin: '0 0 1.25rem' };
const h2Style = { fontSize: '1.5rem', fontWeight: 700, margin: '2.5rem 0 1rem' };
const listStyle = { ...paraStyle, paddingLeft: '1.5rem' };

export default function SecurityPage() {
  return (
    <div className="container" style={containerStyle}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '1.5rem' }}>Security</h1>

      <p style={paraStyle}>
        QryptChat is built so that only you and the people you talk to can read your messages. Encryption
        keys are generated on your device and never shared with our servers, giving QryptChat a
        zero-knowledge architecture: we cannot read your messages, calls, or files even if compelled to.
      </p>

      <h2 style={h2Style}>Cryptography</h2>
      <ul style={listStyle}>
        <li><strong>Key encapsulation:</strong> ML-KEM-1024 (CRYSTALS-Kyber), a NIST-standardized post-quantum KEM (FIPS 203).</li>
        <li><strong>Digital signatures:</strong> CRYSTALS-Dilithium (ML-DSA), NIST-standardized post-quantum signatures (FIPS 204).</li>
        <li><strong>Coverage:</strong> text messages, file transfers, and 1:1 and group voice &amp; video calls are all end-to-end encrypted.</li>
        <li><strong>Key custody:</strong> private keys are created and stored on your device; the server only ever sees ciphertext.</li>
      </ul>

      <h2 style={h2Style}>Why post-quantum</h2>
      <p style={paraStyle}>
        Adversaries can record encrypted traffic today and decrypt it years later once large-scale quantum
        computers exist — the &ldquo;harvest now, decrypt later&rdquo; threat. Using NIST-approved
        post-quantum algorithms protects your conversations against that future, not just against
        classical attackers today.
      </p>

      <h2 style={h2Style}>Privacy &amp; resilience</h2>
      <ul style={listStyle}>
        <li>Phone-number authentication with no email and no password to breach.</li>
        <li>No ads and no third-party advertising trackers.</li>
        <li>Accessible over Tor as a hidden service for censorship resistance.</li>
        <li>A public <a href="/warrant-canary">warrant canary</a> and a <a href="/privacy">privacy policy</a> covering data minimization and GDPR rights.</li>
        <li>Open source under the MIT license so the cryptography can be independently audited and self-hosted.</li>
      </ul>

      <h2 style={h2Style}>Responsible disclosure</h2>
      <p style={paraStyle}>
        Found a vulnerability? Please report it to{' '}
        <a href="mailto:security@qrypt.chat">security@qrypt.chat</a>. Our security contact is also published
        at <a href="/.well-known/security.txt">/.well-known/security.txt</a>. The full source is available on{' '}
        <a href="https://github.com/profullstack/qryptchat-web" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </p>
    </div>
  );
}
