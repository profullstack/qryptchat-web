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

      // `background` only paints the letterbox `fit: 'contain'` adds, and
      // favicon.svg is square, so for every square icon here it paints nothing.
      // The old `needsSolidBackground` branch that set an opaque background for
      // PWA icons was therefore a no-op — the committed icons have always had
      // transparent pixels. Giving the manifest's maskable 192/512 icons a
      // genuinely opaque background needs `.flatten()` plus safe-zone padding,
      // which changes how the installed icon looks; that's a deliberate design
      // change rather than something to fold into the generator silently.
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
    
    // favicon-16x16 / favicon-32x32 are part of ICON_SIZES above now; the old
    // extra pass wrote them to static/favicon-{16,32}.png, a path nothing reads.
    console.log('\n🎉 Icon generation complete!');
    console.log(`📁 Generated ${ICON_SIZES.length} PNG icons in ${ICONS_DIR}/`);
    
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

// Run the script
generateIcons();