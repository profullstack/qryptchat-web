/**
 * @fileoverview Join Conversation API Endpoint
 * Handles joining a conversation room for real-time updates
 */

import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';

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

		// Join SSE room for real-time updates
		sseManager.joinRoom(userId, conversationId);

		return json({ success: true });
	} catch (error) {
		console.error('Join conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});