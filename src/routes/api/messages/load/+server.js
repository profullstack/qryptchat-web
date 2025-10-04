/**
 * @fileoverview Load Messages API Endpoint
 * Handles loading messages for a conversation
 */

import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId, limit = 50, before } = await request.json();

		if (!conversationId) {
			return json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { supabase, user } = locals;

		// Build query
		let query = supabase
			.from('messages')
			.select('*')
			.eq('conversation_id', conversationId)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (before) {
			query = query.lt('created_at', before);
		}

		const { data: messages, error } = await query;

		if (error) {
			console.error('Failed to load messages:', error);
			return json({ error: 'Failed to load messages' }, { status: 500 });
		}

		// Join conversation room for real-time updates
		sseManager.joinRoom(user.id, conversationId);

		return json({
			success: true,
			messages: messages.reverse(),
			hasMore: messages.length === limit
		});
	} catch (error) {
		console.error('Load messages error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});