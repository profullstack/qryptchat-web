export const metadata = {
  title: 'Contact',
  description: 'How to reach QryptChat — support, security, and business contacts, plus our Discord community.',
  alternates: { canonical: '/contact' },
  openGraph: { url: '/contact', title: 'Contact QryptChat' },
};

const containerStyle = { padding: '4rem 0', maxWidth: '760px' };
const paraStyle = { fontSize: '1.0625rem', lineHeight: 1.8, color: 'var(--color-text-secondary)', margin: '0 0 0.75rem' };

export default function ContactPage() {
  return (
    <div className="container" style={containerStyle}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1.5rem' }}>Contact</h1>

      <p style={paraStyle}>
        <strong>Support:</strong> <a href="mailto:support@qrypt.chat">support@qrypt.chat</a>
      </p>
      <p style={paraStyle}>
        <strong>Security &amp; responsible disclosure:</strong> <a href="mailto:security@qrypt.chat">security@qrypt.chat</a>
      </p>
      <p style={paraStyle}>
        <strong>Business &amp; partnerships:</strong> <a href="mailto:business@qrypt.chat">business@qrypt.chat</a>
      </p>
      <p style={paraStyle}>
        <strong>General:</strong> <a href="mailto:hello@profullstack.com">hello@profullstack.com</a>
      </p>
      <p style={paraStyle}>
        <strong>Discord:</strong> <a href="https://discord.gg/w5nHdzpQ29" target="_blank" rel="noopener noreferrer">discord.gg/w5nHdzpQ29</a>
      </p>
    </div>
  );
}
