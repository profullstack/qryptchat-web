// Conversation Participants API endpoint
// Handles fetching participants for a conversation

import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';

// Create service role client instance
const supabaseServiceRole = createServiceRoleClient();

/**
 * GET /api/chat/conversations/[id]/participants
 * Get all participants in a conversation
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

		// Verify user is a participant in the conversation
		const { data: userParticipant, error: participantError } = await supabaseServiceRole
			.from('conversation_participants')
			.select('user_id')
			.eq('conversation_id', conversationId)
			.eq('user_id', locals.user.id)
			.is('left_at', null)
			.single();

		if (participantError || !userParticipant) {
			return json({ error: 'Not authorized to view participants in this conversation' }, { status: 403 });
		}

		// Get all participants in the conversation
		const { data: participants, error } = await supabaseServiceRole
			.from('conversation_participants')
			.select(`
				user_id,
				role,
				joined_at,
				users!conversation_participants_user_id_fkey(
					id,
					username,
					display_name,
					avatar_url
				)
			`)
			.eq('conversation_id', conversationId)
			.is('left_at', null);

		if (error) {
			console.error('Error fetching conversation participants:', error);
			return json({ error: 'Failed to fetch participants' }, { status: 500 });
		}

		// Transform the data for easier consumption
		const transformedParticipants = participants?.map(participant => ({
			user_id: participant.user_id,
			role: participant.role,
			joined_at: participant.joined_at,
			user: participant.users
		})) || [];

		return json({
			success: true,
			participants: transformedParticipants,
			conversation_id: conversationId
		});

	} catch (error) {
		console.error('Error in GET /api/chat/conversations/[id]/participants:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}