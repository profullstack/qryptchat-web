/**
 * @fileoverview Create Conversation API Endpoint
 * Handles creating new conversations
 */

import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { participantIds, name, isGroup } = await request.json();

		if (!participantIds || !Array.isArray(participantIds)) {
			return json({ error: 'Missing or invalid participantIds' }, { status: 400 });
		}

		const { supabase, user } = locals;

		// For direct conversations, check if one already exists
		if (!isGroup && participantIds.length === 1) {
			const otherUserId = participantIds[0];
			
			// Check for existing direct conversation
			const { data: existing } = await supabase
				.from('conversations')
				.select('*, participants:conversation_participants(*)')
				.eq('is_group', false)
				.filter('participants.user_id', 'in', `(${user.id},${otherUserId})`)
				.single();

			if (existing) {
				sseManager.joinRoom(user.id, existing.id);
				return json({ success: true, conversation: existing });
			}
		}

		// Create new conversation
		const { data: conversation, error: convError } = await supabase
			.from('conversations')
			.insert({
				name,
				is_group: isGroup || false,
				created_by: user.id
			})
			.select()
			.single();

		if (convError) {
			console.error('Failed to create conversation:', convError);
			return json({ error: 'Failed to create conversation' }, { status: 500 });
		}

		// Add participants
		const allParticipants = [user.id, ...participantIds];
		const participantInserts = allParticipants.map(userId => ({
			conversation_id: conversation.id,
			user_id: userId
		}));

		const { error: partError } = await supabase
			.from('conversation_participants')
			.insert(participantInserts);

		if (partError) {
			console.error('Failed to add participants:', partError);
			return json({ error: 'Failed to add participants' }, { status: 500 });
		}

		// Join room
		sseManager.joinRoom(user.id, conversation.id);

		// Notify other participants
		for (const participantId of participantIds) {
			sseManager.sendToUser(participantId, MESSAGE_TYPES.CONVERSATION_CREATED, {
				conversation
			});
		}

		return json({
			success: true,
			conversation
		});
	} catch (error) {
		console.error('Create conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});