import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/plugins
 * Returns list of available community plugins
 */
export async function GET() {
  try {
    const pluginsDir = path.join(process.cwd(), 'community-plugins');
    
    // Check if plugins directory exists
    if (!fs.existsSync(pluginsDir)) {
      return NextResponse.json([]);
    }

    const plugins = [];
    const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const pluginDir of pluginDirs) {
      const pluginPath = path.join(pluginsDir, pluginDir);
      const metadataPath = path.join(pluginPath, 'plugin.json');
      
      // Skip if no metadata file
      if (!fs.existsSync(metadataPath)) {
        continue;
      }

      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        
        // Validate required fields
        if (!metadata.name || !metadata.version || !metadata.description) {
          console.warn(`Invalid plugin metadata for ${pluginDir}`);
          continue;
        }

        plugins.push({
          ...metadata,
          directory: pluginDir,
          active: true // For now, all plugins are considered active
        });
      } catch (err) {
        console.error(`Error reading plugin metadata for ${pluginDir}:`, err);
      }
    }

    return NextResponse.json(plugins);
  } catch (error) {
    console.error('Error loading plugins:', error);
    return NextResponse.json({ error: 'Failed to load plugins' }, { status: 500 });
  }
}