/**
 * @fileoverview Start Typing API Endpoint
 * Broadcasts typing indicator to conversation participants
 */

import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.json();

		if (!conversationId) {
			return json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { user } = locals;

		// Broadcast typing indicator to conversation
		sseManager.broadcastToRoom(conversationId, MESSAGE_TYPES.USER_TYPING, {
			userId: user.id,
			conversationId,
			isTyping: true
		}, user.id);

		return json({ success: true });
	} catch (error) {
		console.error('Start typing error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});