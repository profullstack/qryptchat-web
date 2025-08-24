// Per-participant disappearing message timer settings API
// Allows users to configure their own disappearing message preferences

import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';

// Create service role client instance
const supabaseServiceRole = createServiceRoleClient();

/**
 * GET /api/conversations/:id/disappearing-messages
 * Get current user's disappearing message settings for a conversation
 */
export async function GET({ params, locals }) {
  try {
    // Verify user is authenticated
    if (!locals.user?.id) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversationId = params.id;
    if (!conversationId) {
      return json({ error: 'Missing conversation ID' }, { status: 400 });
    }

    // Get user's current settings for this conversation
    const { data: participant, error } = await supabaseServiceRole
      .from('conversation_participants')
      .select('disappear_seconds, start_on')
      .eq('conversation_id', conversationId)
      .eq('user_id', locals.user.id)
      .is('left_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return json({ error: 'Not a participant in this conversation' }, { status: 403 });
      }
      console.error('Error fetching disappearing message settings:', error);
      return json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    return json({
      success: true,
      settings: {
        disappear_seconds: participant.disappear_seconds,
        start_on: participant.start_on,
        enabled: participant.disappear_seconds > 0
      }
    });

  } catch (error) {
    console.error('Error in GET /api/conversations/:id/disappearing-messages:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/conversations/:id/disappearing-messages
 * Update current user's disappearing message settings for a conversation
 */
export async function PUT({ params, request, locals }) {
  try {
    // Verify user is authenticated
    if (!locals.user?.id) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversationId = params.id;
    if (!conversationId) {
      return json({ error: 'Missing conversation ID' }, { status: 400 });
    }

    const { disappear_seconds, start_on } = await request.json();

    // Validate input
    if (typeof disappear_seconds !== 'number' || disappear_seconds < 0) {
      return json({ error: 'disappear_seconds must be a non-negative number' }, { status: 400 });
    }

    if (start_on && !['delivered', 'read'].includes(start_on)) {
      return json({ error: 'start_on must be either "delivered" or "read"' }, { status: 400 });
    }

    // Verify user is a participant in the conversation
    const { data: existingParticipant, error: checkError } = await supabaseServiceRole
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', locals.user.id)
      .is('left_at', null)
      .single();

    if (checkError || !existingParticipant) {
      return json({ error: 'Not a participant in this conversation' }, { status: 403 });
    }

    // Update user's settings
    const { data: updatedParticipant, error: updateError } = await supabaseServiceRole
      .from('conversation_participants')
      .update({
        disappear_seconds,
        start_on: start_on || 'delivered'
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', locals.user.id)
      .select('disappear_seconds, start_on')
      .single();

    if (updateError) {
      console.error('Error updating disappearing message settings:', updateError);
      return json({ error: 'Failed to update settings' }, { status: 500 });
    }

    return json({
      success: true,
      settings: {
        disappear_seconds: updatedParticipant.disappear_seconds,
        start_on: updatedParticipant.start_on,
        enabled: updatedParticipant.disappear_seconds > 0
      },
      message: 'Settings updated successfully. Changes will apply to new messages only.'
    });

  } catch (error) {
    console.error('Error in PUT /api/conversations/:id/disappearing-messages:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
