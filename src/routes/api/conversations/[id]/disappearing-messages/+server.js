import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';

/**
 * GET /api/conversations/[id]/disappearing-messages
 * Get disappearing messages settings for a specific conversation
 */
export async function GET({ params, request }) {
	try {
		const supabase = createServiceRoleClient();
		const authHeader = request.headers.get('authorization');
		
		if (!authHeader?.startsWith('Bearer ')) {
			return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
		}

		const token = authHeader.replace('Bearer ', '');
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);

		if (authError || !user) {
			return json({ error: 'Invalid token' }, { status: 401 });
		}

		const conversationId = params.id;

		// Verify user has access to this conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.single();

		if (participantError || !participant) {
			return json({ error: 'Access denied to this conversation' }, { status: 403 });
		}

		// Get conversation disappearing messages settings
		const { data: conversation, error: conversationError } = await supabase
			.from('conversations')
			.select('disappearing_messages_enabled, disappearing_messages_duration_days')
			.eq('id', conversationId)
			.single();

		if (conversationError) {
			console.error('Error fetching conversation settings:', conversationError);
			return json({ error: 'Failed to fetch conversation settings' }, { status: 500 });
		}

		return json({
			disappearing_messages_enabled: conversation.disappearing_messages_enabled,
			disappearing_messages_duration_days: conversation.disappearing_messages_duration_days
		});

	} catch (error) {
		console.error('Error in GET /api/conversations/[id]/disappearing-messages:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * PUT /api/conversations/[id]/disappearing-messages
 * Update disappearing messages settings for a specific conversation
 */
export async function PUT({ params, request }) {
	try {
		const supabase = createServiceRoleClient();
		const authHeader = request.headers.get('authorization');
		
		if (!authHeader?.startsWith('Bearer ')) {
			return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
		}

		const token = authHeader.replace('Bearer ', '');
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);

		if (authError || !user) {
			return json({ error: 'Invalid token' }, { status: 401 });
		}

		const conversationId = params.id;
		const body = await request.json();
		const { disappearing_messages_enabled, disappearing_messages_duration_days } = body;

		// Validate input
		if (typeof disappearing_messages_enabled !== 'boolean') {
			return json({ error: 'disappearing_messages_enabled must be a boolean' }, { status: 400 });
		}

		if (disappearing_messages_enabled && 
			(typeof disappearing_messages_duration_days !== 'number' || 
			 disappearing_messages_duration_days < 0)) {
			return json({ error: 'disappearing_messages_duration_days must be a non-negative number when enabled' }, { status: 400 });
		}

		// Verify user has access to this conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.single();

		if (participantError || !participant) {
			return json({ error: 'Access denied to this conversation' }, { status: 403 });
		}

		// Update conversation disappearing messages settings
		const updateData = {
			disappearing_messages_enabled,
			disappearing_messages_duration_days: disappearing_messages_enabled ? disappearing_messages_duration_days : null
		};

		const { error: updateError } = await supabase
			.from('conversations')
			.update(updateData)
			.eq('id', conversationId);

		if (updateError) {
			console.error('Error updating conversation settings:', updateError);
			return json({ error: 'Failed to update conversation settings' }, { status: 500 });
		}

		return json({
			success: true,
			disappearing_messages_enabled,
			disappearing_messages_duration_days: updateData.disappearing_messages_duration_days
		});

	} catch (error) {
		console.error('Error in PUT /api/conversations/[id]/disappearing-messages:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}