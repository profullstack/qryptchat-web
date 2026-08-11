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
import sharp from 'sharp';

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

  describe('icon pipeline', () => {
    const generator = readText('scripts/generate-icons.js');
    const installer = readText('scripts/install-desktop-icons.sh');
    const manifest = JSON.parse(readText('public/manifest.json'));

    // `public/` is the only directory Next serves. Both scripts used to read and
    // write `static/` (the SvelteKit holdover), so regenerating icons updated a
    // tree nobody served while the served one silently went stale.
    it('generates into the directory Next actually serves', () => {
      expect(generator).toMatch(/ICONS_DIR\s*=\s*['"]\.\/public\/icons['"]/);
      expect(generator).toMatch(/SVG_PATH\s*=\s*['"]\.\/public\/favicon\.svg['"]/);
    });

    it('no longer points any tooling at static/', () => {
      expect(generator).not.toMatch(/\.\/static\//);
      expect(installer).not.toMatch(/\.\/static\//);
    });

    // ICON_SIZES entries carry a literal `name:`; the maskable family is built
    // from MASKABLE_SIZES with a templated filename, so collect both.
    const maskableSizes = [
      ...(generator.match(/MASKABLE_SIZES\s*=\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/\d+/g)
    ].map((m) => `icon-maskable-${m[0]}x${m[0]}.png`);
    const generated = [
      ...[...generator.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]),
      ...maskableSizes
    ];

    it('regenerates every icon the manifest points at', () => {
      for (const icon of manifest.icons) {
        expect(generated).toContain(icon.src.replace('/icons/', ''));
      }
    });

    it('regenerates every icon the layout points at', () => {
      const layout = readText('src/app/layout.jsx');
      const referenced = [...layout.matchAll(/'\/icons\/([a-z0-9-]+\.png)'/g)].map((m) => m[1]);

      expect(referenced.length).toBeGreaterThan(0);
      for (const name of referenced) {
        expect(generated).toContain(name);
      }
    });

    it('copies desktop-launcher icons from files that exist', () => {
      const copied = [...installer.matchAll(/\.\/public\/icons\/([a-z0-9-]+\.png)/g)].map((m) => m[1]);

      expect(copied.length).toBeGreaterThan(0);
      for (const name of copied) {
        expect(existsSync(resolve(ROOT, 'public/icons', name))).toBe(true);
      }
    });
  });

  // Android masks these to a circle/squircle/teardrop of its choosing and only
  // guarantees the central circle of 80% diameter survives. Both properties
  // below were violated when the manifest aimed `purpose: "maskable"` at the
  // same full-bleed transparent PNGs it used for `purpose: "any"`.
  describe('maskable icons', () => {
    const manifest = JSON.parse(readText('public/manifest.json'));
    const maskable = manifest.icons.filter((icon) =>
      String(icon.purpose ?? '').split(/\s+/).includes('maskable')
    );

    it('does not reuse an `any` icon for `maskable`', () => {
      const anySources = new Set(
        manifest.icons
          .filter((icon) => !String(icon.purpose ?? '').split(/\s+/).includes('maskable'))
          .map((icon) => icon.src)
      );

      expect(maskable.length).toBeGreaterThan(0);
      for (const icon of maskable) {
        expect(anySources.has(icon.src)).toBe(false);
      }
    });

    it.each(maskable.map((icon) => icon.src))('%s is fully opaque', async (src) => {
      const { data, info } = await sharp(resolve(ROOT, 'public', src.replace(/^\//, '')))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let minAlpha = 255;
      for (let i = 3; i < data.length; i += info.channels) {
        if (data[i] < minAlpha) minAlpha = data[i];
      }

      // A transparent maskable icon lets the platform mask show through, so the
      // launcher draws the logo over bare wallpaper instead of a solid tile.
      expect(minAlpha).toBe(255);
    });

    it.each(maskable.map((icon) => icon.src))('%s keeps its artwork inside the safe zone', async (src) => {
      const { data, info } = await sharp(resolve(ROOT, 'public', src.replace(/^\//, '')))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { width, height, channels } = info;

      // Corner pixel is background by construction; anything differing from it
      // is artwork that the mask could clip.
      const bg = [data[0], data[1], data[2]];
      const cx = width / 2;
      const cy = height / 2;
      const safeRadius = 0.4 * width;
      let maxRadius = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * channels;
          const delta =
            Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
          if (delta < 24) continue;
          const radius = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (radius > maxRadius) maxRadius = radius;
        }
      }

      expect(maxRadius).toBeGreaterThan(0);
      expect(maxRadius).toBeLessThanOrEqual(safeRadius);
    });
  });
});
