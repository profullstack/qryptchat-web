/**
 * @fileoverview Guards the PWA install criteria.
 *
 * The SvelteKit -> Next.js migration dropped src/app.html, which carried the
 * `<link rel="manifest">` tag. Nothing in the Next layout replaced it, so
 * Chromium stopped offering "Install app" on desktop and Android, and iOS
 * "Add to Home Screen" stopped opening standalone. These tests fail if any of
 * that wiring is removed again.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const readText = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('PWA installability', () => {
  describe('public/manifest.json', () => {
    const manifest = JSON.parse(readText('public/manifest.json'));

    it('declares the identity fields Chromium requires to install', () => {
      expect(manifest.name).toBeTruthy();
      expect(manifest.short_name).toBeTruthy();
      expect(manifest.start_url).toBeTruthy();
      expect(manifest.scope).toBeTruthy();
    });

    it('requests a standalone window rather than a browser tab', () => {
      expect(manifest.display).toBe('standalone');
    });

    it('sets the colors used for the installed window and splash screen', () => {
      expect(manifest.theme_color).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(manifest.background_color).toMatch(/^#[0-9a-f]{3,8}$/i);
    });

    it('ships both icon sizes Chromium requires (192px and 512px PNG)', () => {
      const pngSizes = manifest.icons
        .filter((icon) => icon.type === 'image/png')
        .map((icon) => Number.parseInt(icon.sizes.split('x')[0], 10));

      expect(pngSizes).toContain(192);
      expect(pngSizes).toContain(512);
    });

    it('offers a maskable icon so Android does not letterbox the launcher icon', () => {
      const maskable = manifest.icons.filter((icon) =>
        String(icon.purpose ?? '').split(/\s+/).includes('maskable')
      );
      expect(maskable.length).toBeGreaterThan(0);
    });

    it('points every icon at a file that exists', () => {
      for (const icon of manifest.icons) {
        expect(existsSync(resolve(ROOT, 'public', icon.src.replace(/^\//, '')))).toBe(true);
      }
    });

    it('keeps the app identity stable for already-installed clients', () => {
      // With `id` absent, Chromium derives it from start_url. Declaring a
      // different id would register as a brand new app and orphan existing
      // installs, so it has to keep matching start_url.
      expect(manifest.id).toBe(manifest.start_url);
    });
  });

  describe('src/app/layout.jsx', () => {
    const layout = readText('src/app/layout.jsx');

    it('links the manifest from the root layout metadata', () => {
      expect(layout).toMatch(/manifest:\s*['"]\/manifest\.json['"]/);
    });

    it('declares apple-mobile-web-app-capable for iOS Add to Home Screen', () => {
      expect(layout).toMatch(/appleWebApp:\s*\{[^}]*capable:\s*true/s);
    });

    it('exports a viewport with a theme color', () => {
      expect(layout).toMatch(/export const viewport\s*=/);
      expect(layout).toMatch(/themeColor:/);
    });

    it('does not hand-roll head tags that the metadata exports already emit', () => {
      expect(layout).not.toMatch(/<meta\s+name="viewport"/);
      expect(layout).not.toMatch(/<meta\s+name="theme-color"/);
      expect(layout).not.toMatch(/<meta\s+name="apple-mobile-web-app-capable"/);
    });
  });

  describe('public/sw.js', () => {
    const sw = readText('public/sw.js');

    it('registers a fetch handler', () => {
      expect(sw).toMatch(/addEventListener\(\s*['"]fetch['"]/);
    });

    it('serves navigations network-first so the app shell cannot go stale', () => {
      expect(sw).toMatch(/request\.mode\s*===\s*['"]navigate['"]/);
    });

    it('never serves API responses from cache', () => {
      expect(sw).toMatch(/pathname\.startsWith\(\s*['"]\/api\/['"]\s*\)/);
    });

    it('leaves non-GET and cross-origin requests alone', () => {
      expect(sw).toMatch(/request\.method\s*!==\s*['"]GET['"]/);
      expect(sw).toMatch(/url\.origin\s*!==\s*self\.location\.origin/);
    });
  });
});
