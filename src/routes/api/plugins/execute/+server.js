import { json } from '@sveltejs/kit';
import { pluginManager } from '$lib/plugins/PluginManager.js';

/**
 * POST /api/plugins/execute
 * Execute a plugin command
 */
export async function POST({ request }) {
  try {
    const { message, context = {} } = await request.json();

    if (!message) {
      return json({ error: 'Message is required' }, { status: 400 });
    }

    // Initialize plugin manager if not already done
    if (!pluginManager.initialized) {
      await pluginManager.initialize();
    }

    // Process the command
    const response = await pluginManager.processCommand(message, context);

    if (response === null) {
      return json({ 
        error: 'Command not recognized',
        isPluginCommand: false 
      }, { status: 404 });
    }

    return json({ 
      response,
      isPluginCommand: true 
    });

  } catch (error) {
    console.error('Error executing plugin command:', error);
    return json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
}

/**
 * GET /api/plugins/execute
 * Get available commands and help
 */
export async function GET() {
  try {
    // Initialize plugin manager if not already done
    if (!pluginManager.initialized) {
      await pluginManager.initialize();
    }

    const commands = pluginManager.getAvailableCommands();
    const helpText = pluginManager.getHelpText();

    return json({
      commands,
      helpText,
      pluginCount: pluginManager.plugins.size
    });

  } catch (error) {
    console.error('Error getting plugin commands:', error);
    return json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
}