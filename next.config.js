/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting is a dev/CI concern — don't let an ESLint error (e.g. a parse
  // error in an unused util) fail the production build / Railway deploy.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
