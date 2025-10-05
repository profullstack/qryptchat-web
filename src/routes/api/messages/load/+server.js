/**
 * @fileoverview Load Messages API Endpoint
 * Handles loading messages for a conversation with user-specific encrypted content
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

		const { supabase, user: authUser } = locals;

		// Get internal user ID from auth user ID
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', authUser.id)
			.single();

		if (userError || !userData) {
			console.error('📨 [SSE-LOAD] User lookup failed:', userError);
			return json({ error: 'User not found' }, { status: 404 });
		}

		const userId = userData.id;

		console.log('📨 [SSE-LOAD] Loading messages:', {
			conversationId,
			authUserId: authUser.id,
			internalUserId: userId,
			limit,
			before
		});

		// Verify user can access this conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', userId)
			.single();

		if (participantError || !participant) {
			console.error('📨 [SSE-LOAD] Access denied:', participantError);
			return json({ error: 'Access denied to conversation' }, { status: 403 });
		}

		// Load messages with user-specific encrypted content (matching WebSocket implementation)
		let query = supabase
			.from('messages')
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
				message_recipients!inner(encrypted_content, recipient_user_id)
			`)
			.eq('conversation_id', conversationId)
			.eq('message_recipients.recipient_user_id', userId)
			.is('deleted_at', null)
			.order('created_at', { ascending: true })
			.limit(limit);

		if (before) {
			query = query.lt('created_at', before);
		}

		const { data: messages, error: messagesError } = await query;

		if (messagesError) {
			console.error('📨 [SSE-LOAD] Failed to load messages:', messagesError);
			return json({ error: 'Failed to load messages' }, { status: 500 });
		}

		console.log('📨 [SSE-LOAD] Loaded', messages?.length || 0, 'messages');

		// Process messages and add user-specific encrypted content
		const processedMessages = (messages || []).map(msg => {
			// Check if this message has per-user encrypted content in message_recipients
			if (msg.message_recipients && msg.message_recipients.length > 0) {
				// Find the encrypted content for this specific user
				const userRecipient = msg.message_recipients.find(r => r.recipient_user_id === userId);
				
				if (userRecipient && userRecipient.encrypted_content) {
					// Database stores base64 as TEXT, convert back to JSON for client-side decryption
					const base64Content = userRecipient.encrypted_content;
					console.log('🔐 [SSE-LOAD] Processing message with recipient data:', {
						messageId: msg.id,
						base64Length: base64Content?.length || 0
					});
					
					try {
						// Convert base64 back to JSON string for client-side decryption
						const decodedContent = Buffer.from(base64Content, 'base64').toString('utf8');
						msg.encrypted_content = decodedContent;
						console.log('🔐 [SSE-LOAD] ✅ Decoded message', msg.id);
					} catch (error) {
						console.error('🔐 [SSE-LOAD] ❌ Failed to decode base64:', error);
						msg.encrypted_content = base64Content;
					}
				} else {
					console.log('🔐 [SSE-LOAD] ⚠️ No recipient data for user in message', msg.id);
					// Keep existing encrypted_content if present (old format)
				}
			} else {
				console.log('🔐 [SSE-LOAD] Message using old format (no recipients table):', msg.id);
				// Keep existing encrypted_content field (old format)
			}
			
			// Remove the message_recipients array as it's no longer needed
			delete msg.message_recipients;
			return msg;
		});

		// Join conversation room for real-time updates
		sseManager.joinRoom(userId, conversationId);

		// Update user activity
		try {
			await supabase.rpc('update_user_activity', { user_uuid: userId });
		} catch (activityError) {
			console.error('Failed to update user activity:', activityError);
		}

		console.log('📨 [SSE-LOAD] ✅ Returning', processedMessages.length, 'messages');

		return json({
			success: true,
			messages: processedMessages,
			hasMore: processedMessages.length === limit
		});
	} catch (error) {
		console.error('📨 [SSE-LOAD] Exception:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});