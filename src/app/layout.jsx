import './globals.css';
import ClientLayout from './client-layout.jsx';
import FeedbackWidget from './feedback-widget.jsx';
import Script from "next/script";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'https://qrypt.chat').replace(/\/$/, '');

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'QryptChat - Quantum-Resistant Encrypted Messaging',
    template: '%s — QryptChat',
  },
  description: 'End-to-end encrypted messaging with post-quantum cryptography (ML-KEM-1024 / CRYSTALS-Kyber and CRYSTALS-Dilithium). Open source, self-hostable, and accessible over Tor.',
  applicationName: 'QryptChat',
  keywords: [
    'quantum-resistant messaging',
    'post-quantum cryptography',
    'end-to-end encryption',
    'ML-KEM-1024',
    'CRYSTALS-Kyber',
    'CRYSTALS-Dilithium',
    'encrypted messenger',
    'private messaging',
    'open source messenger',
    'Signal alternative',
  ],
  authors: [{ name: 'Profullstack, Inc.', url: 'https://profullstack.com' }],
  creator: 'Profullstack, Inc.',
  publisher: 'Profullstack, Inc.',
  openGraph: {
    type: 'website',
    siteName: 'QryptChat',
    title: 'QryptChat - Quantum-Resistant Encrypted Messaging',
    description: 'End-to-end encrypted messaging with post-quantum cryptography. Open source, self-hostable, and accessible over Tor.',
    url: SITE_URL,
    locale: 'en_US',
    images: [{ url: '/banner.png', width: 1200, height: 630, alt: 'QryptChat — Quantum-Resistant Encrypted Messaging' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@profullstackinc',
    creator: '@profullstackinc',
    title: 'QryptChat - Quantum-Resistant Encrypted Messaging',
    description: 'End-to-end encrypted messaging with post-quantum cryptography. Open source, self-hostable, and accessible over Tor.',
    images: ['/banner.png'],
  },
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Profullstack, Inc.',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.svg`,
  foundingDate: '2024',
  founder: { '@type': 'Person', name: 'Anthony Ettinger' },
  brand: { '@type': 'Brand', name: 'QryptChat' },
  contactPoint: [
    { '@type': 'ContactPoint', contactType: 'customer support', email: 'support@qrypt.chat' },
    { '@type': 'ContactPoint', contactType: 'security', email: 'security@qrypt.chat' },
    { '@type': 'ContactPoint', contactType: 'sales', email: 'business@qrypt.chat' },
  ],
  sameAs: [
    'https://github.com/profullstack',
    'https://x.com/profullstackinc',
    'https://bsky.app/profile/chovyfu.bsky.social',
    'https://discord.gg/w5nHdzpQ29',
  ],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'QryptChat',
  url: SITE_URL,
  publisher: { '@type': 'Organization', name: 'Profullstack, Inc.' },
  inLanguage: 'en',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
              <Script data-site="38c4083a-a35e-435d-8a0e-3510c465f419" src="https://crawlproof.com/stats.js" strategy="afterInteractive" />
      <FeedbackWidget /></body>
    </html>
  );
}
