import HomeContent from './home-content.jsx';

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'https://qrypt.chat').replace(/\/$/, '');

export const metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'QryptChat',
  applicationCategory: 'CommunicationApplication',
  operatingSystem: 'Web, Android, iOS',
  url: SITE_URL,
  description:
    'Quantum-resistant, end-to-end encrypted messaging using NIST-approved post-quantum algorithms (ML-KEM-1024 / CRYSTALS-Kyber and CRYSTALS-Dilithium). Open source, self-hostable, and accessible over Tor.',
  operatingSystemVersion: 'Any modern browser',
  license: 'https://opensource.org/licenses/MIT',
  isAccessibleForFree: true,
  author: { '@type': 'Organization', name: 'Profullstack, Inc.' },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
  },
  featureList: [
    'Post-quantum end-to-end encryption (ML-KEM-1024 / CRYSTALS-Kyber, CRYSTALS-Dilithium)',
    'Phone-number authentication with no email required',
    'Encrypted 1:1 and group voice & video calls',
    'Real-time messaging with typing indicators and read receipts',
    'Disappearing messages',
    'Encrypted file sharing',
    'Multi-language support',
    'Tor onion service access',
    'Open source (MIT), self-hostable',
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <HomeContent />
    </>
  );
}
