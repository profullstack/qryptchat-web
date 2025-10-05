/**
 * @fileoverview Send Message API Endpoint
 * Handles sending messages via POST request with multi-recipient encryption
 */

import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';
import { getServiceRoleClient } from '$lib/supabase/service-role.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId, encryptedContents, messageType = 'text', replyToId, metadata } = await request.json();

		if (!conversationId || !encryptedContents) {
			return json({ error: 'Conversation ID and encrypted contents are required' }, { status: 400 });
		}

		// Validate encryptedContents is an object with user_id -> encrypted_content mappings
		if (typeof encryptedContents !== 'object' || Object.keys(encryptedContents).length === 0) {
			return json({ error: 'encryptedContents must be an object with user_id -> encrypted_content mappings' }, { status: 400 });
		}

		const { supabase, user: authUser } = locals;

		// Get internal user ID from auth user ID
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', authUser.id)
			.single();

		if (userError || !userData) {
			console.error('📨 [SSE-SEND] User lookup failed:', userError);
			return json({ error: 'User not found' }, { status: 404 });
		}

		const userId = userData.id;

		// Verify user can access this conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id, role')
			.eq('conversation_id', conversationId)
			.eq('user_id', userId)
			.single();

		if (participantError || !participant) {
			return json({ error: 'Access denied to conversation' }, { status: 403 });
		}

		// Insert message into database (without encrypted_content in main table)
		const messageData = {
			conversation_id: conversationId,
			sender_id: userId,
			message_type: messageType,
			encrypted_content: Buffer.from(''), // Empty buffer - actual content stored in message_recipients
			...(replyToId && { reply_to_id: replyToId }),
			metadata: metadata || {},
			created_at: new Date().toISOString()
		};

		const { data: newMessage, error: insertError } = await supabase
			.from('messages')
			.insert(messageData)
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url)
			`)
			.single();

		if (insertError) {
			console.error('Error inserting message:', insertError);
			return json({ error: 'Failed to send message' }, { status: 500 });
		}

		// Create per-participant encrypted message copies using service role client
		try {
			// Convert JSON encrypted content to base64 for database storage
			const base64EncryptedContents = {};
			for (const [userId, jsonEncryptedContent] of Object.entries(encryptedContents)) {
				console.log('🔐 [SSE-SEND] Processing encrypted content for storage:', {
					userId,
					jsonType: typeof jsonEncryptedContent,
					jsonLength: jsonEncryptedContent?.length || 0
				});
				
				// Convert JSON string to base64 for database storage
				const base64Content = Buffer.from(jsonEncryptedContent, 'utf8').toString('base64');
				base64EncryptedContents[userId] = base64Content;
			}

			const serviceRoleClient = getServiceRoleClient();
			const { error: recipientsError } = await serviceRoleClient
				.rpc('fn_create_message_recipients', {
					p_message_id: newMessage.id,
					p_encrypted_contents: base64EncryptedContents
				});

			if (recipientsError) {
				console.error('Error creating message recipients:', recipientsError);
				// Clean up the message if recipients creation failed
				await supabase
					.from('messages')
					.delete()
					.eq('id', newMessage.id);
				
				return json({ error: 'Failed to create encrypted message copies' }, { status: 500 });
			}
		} catch (error) {
			console.error('Error in message recipients creation:', error);
			// Clean up the message if recipients creation failed
			await supabase
				.from('messages')
				.delete()
				.eq('id', newMessage.id);
			
			return json({ error: 'Failed to create encrypted message copies' }, { status: 500 });
		}

		// Update sender's activity
		try {
			await supabase.rpc('update_user_activity', { user_uuid: user.id });
		} catch (activityError) {
			console.error('Failed to update user activity:', activityError);
		}

		// Broadcast new message to conversation participants via SSE
		// Signal that clients should reload messages to get proper encrypted content
		sseManager.broadcastToRoom(conversationId, MESSAGE_TYPES.NEW_MESSAGE, {
			message: newMessage,
			shouldReloadMessages: true
		});

		console.log('📨 [SSE-SEND] Message sent and broadcasted:', {
			conversationId,
			messageId: newMessage.id
		});

		return json({
			success: true,
			message: newMessage
		});
	} catch (error) {
		console.error('Send message error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});