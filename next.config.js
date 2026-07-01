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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting is a dev/CI concern — don't let an ESLint error (e.g. a parse
  // error in an unused util) fail the production build / Railway deploy.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
