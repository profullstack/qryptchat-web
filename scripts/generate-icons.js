#!/usr/bin/env node

/**
 * Generate PNG icons from SVG for iOS and PWA compatibility
 * Converts favicon.svg to various PNG sizes needed for mobile devices
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

// iOS and PWA icon sizes
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
  { size: 192, name: 'icon-192x192.png' },
  { size: 256, name: 'icon-256x256.png' },
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' }
];

const SVG_PATH = './static/favicon.svg';
const ICONS_DIR = './static/icons';

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
    for (const { size, name } of ICON_SIZES) {
      const outputPath = path.join(ICONS_DIR, name);
      
      // Determine if this is a PWA icon that needs solid background
      const needsSolidBackground = name.includes('icon-') && (size >= 192);
      
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: needsSolidBackground
            ? { r: 255, g: 255, b: 255, alpha: 1 } // White background for PWA icons
            : { r: 255, g: 255, b: 255, alpha: 0 } // Transparent for Apple touch icons
        })
        .png({
          quality: 95,
          compressionLevel: 9
        })
        .toFile(outputPath);
      
      console.log(`✅ Generated ${name} (${size}x${size})`);
    }
    
    // Generate favicon.ico (16x16 and 32x32 combined)
    const faviconPath = './static/favicon.ico';
    await sharp(svgBuffer)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile('./static/favicon-32.png');
    
    await sharp(svgBuffer)
      .resize(16, 16, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile('./static/favicon-16.png');
    
    console.log('✅ Generated additional favicon sizes');
    
    console.log('\n🎉 Icon generation complete!');
    console.log(`📁 Generated ${ICON_SIZES.length} PNG icons in ${ICONS_DIR}/`);
    
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

// Run the script
generateIcons();