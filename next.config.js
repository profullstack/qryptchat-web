import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    // Alias svelte/store to our React-compatible shim
    config.resolve.alias = {
      ...config.resolve.alias,
      'svelte/store': resolve(__dirname, 'src/lib/shims/svelte-store.js'),
      'svelte': resolve(__dirname, 'src/lib/shims/svelte-store.js'),
    };
    return config;
  },
};

export default nextConfig;
