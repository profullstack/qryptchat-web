/**
 * @fileoverview Archive Conversation API Endpoint
 * Handles archiving a conversation for the current user
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

		// Get internal user ID from auth user ID
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', authUser.id)
			.single();

		if (userError || !userData) {
			console.error('User lookup failed:', userError);
			return json({ error: 'User not found' }, { status: 404 });
		}

		const userId = userData.id;

		// Call the archive_conversation database function with internal user ID
		const { data: success, error: archiveError } = await supabase.rpc('archive_conversation', {
			conversation_uuid: conversationId,
			user_uuid: userId
		});

		if (archiveError) {
			console.error('Archive conversation error:', archiveError);
			return json({ error: 'Failed to archive conversation' }, { status: 500 });
		}

		if (!success) {
			return json({
				error: 'Conversation not found or cannot be archived'
			}, { status: 404 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Archive conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});