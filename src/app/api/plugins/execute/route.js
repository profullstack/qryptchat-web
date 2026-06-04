import { NextResponse } from 'next/server';
import { pluginManager } from '@/lib/plugins/PluginManager.js';
import { createSupabaseServerClient } from '@/lib/supabase.js';

/**
 * POST /api/plugins/execute
 * Execute a plugin command (requires authentication)
 */
export async function POST(request, { params } = {}) {
  try {
    // Authentication check
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, context = {} } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Initialize plugin manager if not already done
    if (!pluginManager.initialized) {
      await pluginManager.initialize();
    }

    // Process the command
    const response = await pluginManager.processCommand(message, context);

    if (response === null) {
      return NextResponse.json({ 
        error: 'Command not recognized',
        isPluginCommand: false 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      response,
      isPluginCommand: true 
    });

  } catch (error) {
    console.error('Error executing plugin command:', error);
    return NextResponse.json({ 
      error: 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * GET /api/plugins/execute
 * Get available commands and help (requires authentication)
 */
export async function GET(request, { params } = {}) {
  try {
    // Authentication check
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize plugin manager if not already done
    if (!pluginManager.initialized) {
      await pluginManager.initialize();
    }

    const commands = pluginManager.getAvailableCommands();
    const helpText = pluginManager.getHelpText();

    return NextResponse.json({
      commands,
      helpText,
      pluginCount: pluginManager.plugins.size
    });

  } catch (error) {
    console.error('Error getting plugin commands:', error);
    return NextResponse.json({ 
      error: 'Internal server error'
    }, { status: 500 });
  }
}
