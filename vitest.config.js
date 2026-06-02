import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const __dirname = resolve('.');

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}', 'tests/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'tests/setup.js',
        'tests/mocks/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/coverage/**',
      ],
      include: ['src/**/*.{js,ts,jsx,tsx}', '!src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    },
    alias: {
      '@': resolve(__dirname, './src'),
      'svelte/store': resolve(__dirname, 'src/lib/shims/svelte-store.js'),
      'svelte': resolve(__dirname, 'src/lib/shims/svelte-store.js'),
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'svelte/store': resolve(__dirname, 'src/lib/shims/svelte-store.js'),
      'svelte': resolve(__dirname, 'src/lib/shims/svelte-store.js'),
    },
  },
});
