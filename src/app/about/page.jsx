export const metadata = {
  title: 'About',
  description:
    'QryptChat is quantum-resistant, end-to-end encrypted messaging by Profullstack, Inc. Learn about our mission, our team, and why we built a post-quantum messenger.',
  alternates: { canonical: '/about' },
  openGraph: { url: '/about', title: 'About QryptChat' },
};

const containerStyle = { padding: '4rem 0', maxWidth: '760px' };
const paraStyle = { fontSize: '1.0625rem', lineHeight: 1.8, color: 'var(--color-text-secondary)', margin: '0 0 1.25rem' };
const h2Style = { fontSize: '1.5rem', fontWeight: 700, margin: '2.5rem 0 1rem' };

export default function AboutPage() {
  return (
    <div className="container" style={containerStyle}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1.5rem' }}>About QryptChat</h1>

      <p style={paraStyle}>
        QryptChat is a quantum-resistant, end-to-end encrypted messaging platform built by{' '}
        <strong>Profullstack, Inc.</strong> (founded 2024). It uses ML-KEM-1024 (CRYSTALS-Kyber) and
        CRYSTALS-Dilithium — NIST-approved post-quantum algorithms — so your conversations stay private
        against both today&apos;s attackers and tomorrow&apos;s quantum computers.
      </p>

      <h2 style={h2Style}>Our mission</h2>
      <p style={paraStyle}>
        Most messengers were designed for a world without quantum computers. Encrypted traffic captured
        today can be stored and decrypted later once large-scale quantum hardware arrives — a
        &ldquo;harvest now, decrypt later&rdquo; attack. Our mission is to make communication that is
        private not just today but decades from now, using cryptography that is already standardized by
        NIST, and to keep it open source so anyone can verify and self-host it.
      </p>

      <h2 style={h2Style}>What makes QryptChat different</h2>
      <ul style={{ ...paraStyle, paddingLeft: '1.5rem' }}>
        <li>Post-quantum end-to-end encryption using ML-KEM-1024 and CRYSTALS-Dilithium.</li>
        <li>Phone-number sign-up — no email address and no password required.</li>
        <li>Encrypted voice &amp; video calls, disappearing messages, and file sharing.</li>
        <li>Open source under the MIT license and fully self-hostable.</li>
        <li>Accessible over Tor as a hidden service, plus a public warrant canary.</li>
      </ul>

      <h2 style={h2Style}>Team</h2>
      <ul style={{ ...paraStyle, paddingLeft: '1.5rem' }}>
        <li><strong>Anthony Ettinger</strong> — Founder &amp; Developer</li>
        <li><strong>mrpthedev</strong> — Developer</li>
      </ul>

      <p style={paraStyle}>
        QryptChat is free and open source. See the code on{' '}
        <a href="https://github.com/profullstack/qryptchat-web" target="_blank" rel="noopener noreferrer">GitHub</a>,
        read our <a href="/security">security overview</a>, or <a href="/contact">get in touch</a>.
      </p>
    </div>
  );
}
