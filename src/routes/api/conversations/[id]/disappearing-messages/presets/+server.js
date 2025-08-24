// Disappearing message timer presets API
// Provides common timer presets for UI

import { json } from '@sveltejs/kit';

/**
 * GET /api/conversations/:id/disappearing-messages/presets
 * Get common timer presets for UI
 */
export async function GET({ params, locals }) {
  try {
    // Verify user is authenticated
    if (!locals.user?.id) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const presets = [
      { label: 'Off', seconds: 0, description: 'Messages never disappear' },
      { label: '30 seconds', seconds: 30, description: 'Messages disappear after 30 seconds' },
      { label: '1 minute', seconds: 60, description: 'Messages disappear after 1 minute' },
      { label: '5 minutes', seconds: 300, description: 'Messages disappear after 5 minutes' },
      { label: '30 minutes', seconds: 1800, description: 'Messages disappear after 30 minutes' },
      { label: '1 hour', seconds: 3600, description: 'Messages disappear after 1 hour' },
      { label: '6 hours', seconds: 21600, description: 'Messages disappear after 6 hours' },
      { label: '1 day', seconds: 86400, description: 'Messages disappear after 1 day' },
      { label: '1 week', seconds: 604800, description: 'Messages disappear after 1 week' }
    ];

    return json({
      success: true,
      presets,
      start_on_options: [
        { value: 'delivered', label: 'When delivered', description: 'Timer starts when message is delivered' },
        { value: 'read', label: 'When read', description: 'Timer starts when message is read' }
      ]
    });

  } catch (error) {
    console.error('Error in GET /api/conversations/:id/disappearing-messages/presets:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}