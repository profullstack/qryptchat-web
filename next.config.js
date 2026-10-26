import { readFileSync } from 'node:fs';

// Security headers applied to every response. We deliberately do NOT set a
// restrictive script-src/style-src CSP here: the app relies on inline styles,
// Next.js inline bootstrap scripts, the crawlproof.com analytics script, and
// Supabase image/websocket origins, so an enforcing CSP would break it. We only
// set `frame-ancestors` (clickjacking protection) plus the other low-risk
// hardening headers. HSTS only affects HTTPS responses (ignored over the Tor
// http onion service, which is fine).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(), browsing-topics=()' },
];

// One id per build, baked into the client and the server alike. An installed
// iOS web app is resumed from memory rather than reloaded, so it compares its
// own id with /api/version to learn that a newer build is live
// (src/lib/app-update.js).
const BUILD_ID = `${JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version}-${Date.now().toString(36)}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  generateBuildId: async () => BUILD_ID,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  // The image runs the standalone server under Bun (`bun server.js` from
  // entrypoint.sh): server.js plus only the dependencies it imports.
  output: 'standalone',
  // Trace from this directory, never a lockfile further up the disk.
  outputFileTracingRoot: new URL('.', import.meta.url).pathname,
  // /api/plugins lists community-plugins/*/plugin.json from process.cwd() at
  // request time; the tracer only follows imports, so name the files.
  outputFileTracingIncludes: {
    '/api/plugins': ['./community-plugins/**/*'],
  },
  async headers() {
    // OpenEmoji/OpenIcon files change only when scripts/sync-openemoji.js runs
    // against a new set release; a week of caching keeps a busy chat from
    // re-fetching every emoji on every repaint.
    const assetCache = [{ key: 'Cache-Control', value: 'public, max-age=604800' }];
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/openemoji/:path*', headers: assetCache },
      { source: '/openicon/:path*', headers: assetCache },
      // The curl installer: shown as text in a browser, never offered as a download.
      { source: '/install.sh', headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }] },
    ];
  },
};

export default nextConfig;
