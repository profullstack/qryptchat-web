export default function AboutPage() {
  return (
    <div className="container" style={{padding: '4rem 0'}}>
      <h1 style={{fontSize: '2.5rem', fontWeight: 800, marginBottom: '1.5rem'}}>About QryptChat</h1>
      <p style={{fontSize: '1.125rem', lineHeight: 1.8, color: 'var(--color-text-secondary)', maxWidth: '720px'}}>
        QryptChat is a quantum-resistant, end-to-end encrypted messaging platform. Built with ML-KEM-1024 (CRYSTALS-Kyber) and CRYSTALS-Dilithium — NIST-approved post-quantum algorithms — your conversations are safe against both current and future threats including quantum computers.
      </p>
    </div>
  );
}
