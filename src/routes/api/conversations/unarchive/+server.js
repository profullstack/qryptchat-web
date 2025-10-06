/**
 * @fileoverview Unarchive Conversation API Endpoint
 * Handles unarchiving a conversation for the current user
 */

import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.json();

		if (!conversationId) {
			return json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { supabase, user: authUser } = locals;

		// Call the unarchive_conversation database function with auth user ID
		// The function will handle the conversion to internal user ID
		const { data: success, error: unarchiveError } = await supabase.rpc('unarchive_conversation', {
			conversation_uuid: conversationId,
			user_uuid: authUser.id
		});

		if (unarchiveError) {
			console.error('Unarchive conversation error:', unarchiveError);
			return json({ error: 'Failed to unarchive conversation' }, { status: 500 });
		}

		if (!success) {
			return json({
				error: 'Conversation not found or cannot be unarchived'
			}, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Unarchive conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});