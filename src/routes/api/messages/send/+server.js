/**
 * @fileoverview Send Message API Endpoint
 * Handles sending messages via POST request
 */

import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId, content, encryptedContent, fileUrl, fileName, fileSize, replyTo } = await request.json();

		if (!conversationId || (!content && !encryptedContent)) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		const { supabase, user } = locals;

		// Insert message into database
		const { data: message, error } = await supabase
			.from('messages')
			.insert({
				conversation_id: conversationId,
				sender_id: user.id,
				content,
				encrypted_content: encryptedContent,
				file_url: fileUrl,
				file_name: fileName,
				file_size: fileSize,
				reply_to: replyTo
			})
			.select()
			.single();

		if (error) {
			console.error('Failed to send message:', error);
			return json({ error: 'Failed to send message' }, { status: 500 });
		}

		// Broadcast new message to conversation participants via SSE
		sseManager.broadcastToRoom(conversationId, MESSAGE_TYPES.NEW_MESSAGE, {
			message
		}, user.id);

		return json({
			success: true,
			message
		});
	} catch (error) {
		console.error('Send message error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});