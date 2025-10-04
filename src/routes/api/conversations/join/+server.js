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

		const { user } = locals;

		// Join SSE room for real-time updates
		sseManager.joinRoom(user.id, conversationId);

		return json({ success: true });
	} catch (error) {
		console.error('Join conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});