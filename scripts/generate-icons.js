#!/usr/bin/env node

/**
 * Generate PNG icons from SVG for iOS and PWA compatibility
 * Converts favicon.svg to various PNG sizes needed for mobile devices
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

// Every icon family referenced by public/manifest.json and src/app/layout.jsx.
// The `android-chrome-*` set is what the manifest actually points at, so it has
// to be regenerated here too — leaving it out meant `pnpm icons:generate`
// silently refreshed everything except the icons Chromium installs with.
const ICON_SIZES = [
  { size: 57, name: 'apple-touch-icon-57x57.png' },
  { size: 60, name: 'apple-touch-icon-60x60.png' },
  { size: 72, name: 'apple-touch-icon-72x72.png' },
  { size: 76, name: 'apple-touch-icon-76x76.png' },
  { size: 114, name: 'apple-touch-icon-114x114.png' },
  { size: 120, name: 'apple-touch-icon-120x120.png' },
  { size: 144, name: 'apple-touch-icon-144x144.png' },
  { size: 152, name: 'apple-touch-icon-152x152.png' },
  { size: 180, name: 'apple-touch-icon-180x180.png' },
  { size: 36, name: 'icon-36x36.png' },
  { size: 48, name: 'icon-48x48.png' },
  { size: 96, name: 'icon-96x96.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 256, name: 'icon-256x256.png' },
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' },
  { size: 36, name: 'android-chrome-36x36.png' },
  { size: 48, name: 'android-chrome-48x48.png' },
  { size: 72, name: 'android-chrome-72x72.png' },
  { size: 96, name: 'android-chrome-96x96.png' },
  { size: 144, name: 'android-chrome-144x144.png' },
  { size: 192, name: 'android-chrome-192x192.png' },
  { size: 256, name: 'android-chrome-256x256.png' },
  { size: 384, name: 'android-chrome-384x384.png' },
  { size: 512, name: 'android-chrome-512x512.png' },
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 48, name: 'favicon-48x48.png' },
  { size: 64, name: 'favicon-64x64.png' },
  { size: 128, name: 'favicon-128x128.png' },
  { size: 194, name: 'favicon-194x194.png' },
  { size: 256, name: 'favicon-256x256.png' },
  { size: 512, name: 'favicon-512x512.png' },
  // Windows tiles, referenced from layout.jsx and public/icons/browserconfig.xml.
  // These stay transparent: Windows paints msapplication-TileColor behind them.
  // 310x150 is the wide tile, so these carry explicit width/height.
  { size: 70, name: 'mstile-70x70.png' },
  { size: 144, name: 'mstile-144x144.png' },
  { size: 150, name: 'mstile-150x150.png' },
  { width: 310, height: 150, name: 'mstile-310x150.png' },
  { size: 310, name: 'mstile-310x310.png' }
];

// public/ is the only directory Next serves. The generator used to write into
// static/ (the SvelteKit holdover), so regenerated icons never reached the app
// and the two trees drifted apart.
const SVG_PATH = './public/favicon.svg';
const ICONS_DIR = './public/icons';

// Maskable icons are a separate family from the ones above, not a re-label of
// them. Android applies a platform mask (circle, squircle, teardrop...) and
// guarantees only the central circle of 80% diameter survives, so a maskable
// icon needs two things the `any` icons must NOT have: an opaque background,
// and the artwork pulled inside that safe circle. The manifest used to point
// both purposes at the same full-bleed transparent file, which meant Android
// cropped 4.3% of the logo and showed the mask through the transparent pixels.
const MASKABLE_SIZES = [192, 512];

// The spec's safe circle has radius 0.40 of the icon width. Targeting 0.39
// leaves a hair of slack: scaling to exactly 0.40 lands antialiased edge
// pixels a fraction over the line once the artwork is downscaled to integer
// dimensions, which the generated-icon test then flags.
const SAFE_ZONE_RATIO = 0.39;

// Matches manifest.json's `background_color`, so the installed icon and the
// splash screen it launches into share a background.
const MASKABLE_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * Distance from the centre of `buffer` to its farthest non-transparent pixel.
 *
 * Scaling by this rather than by the bounding box matters because the artwork
 * is an irregular glyph: its bounding-box corners are empty, so the box-based
 * rule would shrink it further than the mask actually requires.
 */
async function contentRadius(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cx = width / 2;
  const cy = height / 2;
  let maxRadius = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] < 16) continue;
      const radius = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (radius > maxRadius) maxRadius = radius;
    }
  }

  return maxRadius;
}

/**
 * Render one maskable icon: trim the artwork to its opaque bounds, scale it so
 * nothing escapes the safe circle, centre it, and flatten onto a solid colour.
 *
 * Trimming also re-centres the glyph — it sits off-centre in favicon.svg's
 * viewBox (82px of padding on the left, 50px on the right), which a plain
 * resize preserves and the mask then crops unevenly.
 */
async function generateMaskableIcon(svgBuffer, size) {
  // Render at 2x so the trim finds precise edges before anything is downscaled.
  const rendered = await sharp(svgBuffer, { density: 600 })
    .resize(size * 2, size * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const trimmed = await sharp(rendered).trim({ threshold: 1 }).png().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  const scale = (SAFE_ZONE_RATIO * size) / (await contentRadius(trimmed));
  const artWidth = Math.max(1, Math.round(width * scale));
  const artHeight = Math.max(1, Math.round(height * scale));

  const art = await sharp(trimmed).resize(artWidth, artHeight, { fit: 'fill' }).png().toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: MASKABLE_BACKGROUND }
  })
    .composite([{
      input: art,
      left: Math.round((size - artWidth) / 2),
      top: Math.round((size - artHeight) / 2)
    }])
    .flatten({ background: MASKABLE_BACKGROUND })
    .png({ quality: 95, compressionLevel: 9 })
    .toBuffer();
}

async function generateIcons() {
  try {
    console.log('🎨 Generating PNG icons from SVG...');
    
    // Create icons directory if it doesn't exist
    await fs.mkdir(ICONS_DIR, { recursive: true });
    console.log(`📁 Created ${ICONS_DIR} directory`);
    
    // Read the SVG file
    const svgBuffer = await fs.readFile(SVG_PATH);
    console.log(`📖 Read ${SVG_PATH}`);
    
    // Generate each icon size
    for (const { size, width, height, name } of ICON_SIZES) {
      const outputPath = path.join(ICONS_DIR, name);
      const w = width ?? size;
      const h = height ?? size;

      // These stay transparent on purpose. `background` only paints the
      // letterbox `fit: 'contain'` adds, and favicon.svg is square, so it
      // paints nothing here — which is right for `purpose: "any"`, favicons
      // and Windows tiles. Only the maskable family below is flattened.
      await sharp(svgBuffer)
        .resize(w, h, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png({
          quality: 95,
          compressionLevel: 9
        })
        .toFile(outputPath);

      console.log(`✅ Generated ${name} (${w}x${h})`);
    }
    
    for (const size of MASKABLE_SIZES) {
      const name = `icon-maskable-${size}x${size}.png`;
      const buffer = await generateMaskableIcon(svgBuffer, size);
      await fs.writeFile(path.join(ICONS_DIR, name), buffer);
      console.log(`✅ Generated ${name} (${size}x${size}, opaque, safe-zone padded)`);
    }

    // favicon-16x16 / favicon-32x32 are part of ICON_SIZES above now; the old
    // extra pass wrote them to static/favicon-{16,32}.png, a path nothing reads.
    console.log('\n🎉 Icon generation complete!');
    console.log(`📁 Generated ${ICON_SIZES.length + MASKABLE_SIZES.length} PNG icons in ${ICONS_DIR}/`);
    
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

// Run the script
generateIcons();