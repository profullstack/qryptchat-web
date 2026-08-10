import './globals.css';
import ClientLayout from './client-layout.jsx';
import { FeedbackWidget } from '@profullstack/stack/feedback';
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
  // Chromium refuses to offer "Install app" without a linked manifest, and iOS
  // needs the apple-* tags below for "Add to Home Screen" to open standalone.
  // Both were lost when src/app.html went away in the Next.js migration.
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'QryptChat',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      // Desktop environments (KDE/Plasma, GNOME) pick the largest declared icon
      // for the installed app's launcher entry.
      { url: '/icons/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [
      { url: '/icons/apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/apple-touch-icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/apple-touch-icon-144x144.png', sizes: '144x144', type: 'image/png' },
      { url: '/icons/apple-touch-icon-120x120.png', sizes: '120x120', type: 'image/png' },
      { url: '/icons/apple-touch-icon-114x114.png', sizes: '114x114', type: 'image/png' },
      { url: '/icons/apple-touch-icon-76x76.png', sizes: '76x76', type: 'image/png' },
      { url: '/icons/apple-touch-icon-72x72.png', sizes: '72x72', type: 'image/png' },
      { url: '/icons/apple-touch-icon-60x60.png', sizes: '60x60', type: 'image/png' },
      { url: '/icons/apple-touch-icon-57x57.png', sizes: '57x57', type: 'image/png' },
    ],
  },
  other: {
    // `appleWebApp.capable` above emits the modern `mobile-web-app-capable`.
    // iOS before 15.4 ignores the manifest's `display` and only goes standalone
    // on the apple-prefixed tag, which Next no longer emits — declare it here.
    'apple-mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#6366f1',
    'msapplication-TileImage': '/icons/mstile-144x144.png',
    'msapplication-config': '/icons/browserconfig.xml',
  },
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

export const viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
        {/* Icons, viewport, theme-color and the apple-mobile-web-app-* tags are
            emitted from the `metadata` / `viewport` exports above — declaring
            them here too produced duplicate tags. */}
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
      <FeedbackWidget property="qrypt.chat" hideOnRoutes={['/chat', '/chats', '/u', '/anon']} /></body>
    </html>
  );
}
