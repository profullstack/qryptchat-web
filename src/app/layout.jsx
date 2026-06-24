import './globals.css';
import ClientLayout from './client-layout.jsx';
import Script from "next/script";

export const metadata = {
  title: 'QryptChat - Quantum-Resistant Encrypted Messaging',
  description: 'End-to-end encrypted messaging with post-quantum cryptography.',
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
      </head>
      <body suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
              <Script data-site="38c4083a-a35e-435d-8a0e-3510c465f419" src="https://crawlproof.com/stats.js" strategy="afterInteractive" />
      <script async src="https://feedback.profullstack.com/embed/profullstack-feedback.js" data-property="qrypt.chat"></script></body>
    </html>
  );
}
