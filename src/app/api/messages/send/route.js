/**
 * @fileoverview Send Message API Endpoint
 * Handles sending messages via POST request with multi-recipient encryption
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { sseManager } from '@/lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '@/lib/api/protocol.js';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';


const SENDABLE_TYPES = new Set(['text', 'image', 'file', 'reaction', 'call']);

export const POST = withAuth(async ({ request, locals }) => {
	try {
		let body;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
		}

		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
		}

		const { conversationId, encryptedContents, messageType = 'text', replyToId, metadata } = body;

		if (!conversationId || !encryptedContents) {
			return NextResponse.json({ error: 'Conversation ID and encrypted contents are required' }, { status: 400 });
		}

		// Validate encryptedContents is an object with user_id -> encrypted_content mappings
		if (
			typeof encryptedContents !== 'object' ||
			Array.isArray(encryptedContents) ||
			Object.keys(encryptedContents).length === 0
		) {
			return NextResponse.json({ error: 'encryptedContents must be an object with user_id -> encrypted_content mappings' }, { status: 400 });
		}

		if (Object.values(encryptedContents).some((content) => typeof content !== 'string')) {
			return NextResponse.json({ error: 'encryptedContents values must be encrypted content strings' }, { status: 400 });
		}

		if (Object.values(encryptedContents).some((content) => !content.trim())) {
			return NextResponse.json({ error: 'encryptedContents values must not be blank' }, { status: 400 });
		}

		if (metadata !== undefined && (typeof metadata !== 'object' || Array.isArray(metadata) || metadata === null)) {
			return NextResponse.json({ error: 'metadata must be a JSON object' }, { status: 400 });
		}

		// 'reaction' messages carry an encrypted { target, emoji } envelope (see
		// src/lib/chat/reactions.js); the server never learns what was reacted to.
		if (!SENDABLE_TYPES.has(messageType)) {
			return NextResponse.json({ error: `messageType must be one of ${[...SENDABLE_TYPES].join(', ')}` }, { status: 400 });
		}
		if (replyToId !== undefined && replyToId !== null && (typeof replyToId !== 'string' || !replyToId)) {
			return NextResponse.json({ error: 'replyToId must be a message id' }, { status: 400 });
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
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
			return NextResponse.json({ error: 'Access denied to conversation' }, { status: 403 });
		}

		// A reply must point at a message in THIS conversation (it is shown as a
		// quote, so a foreign id would be a way to probe other conversations).
		if (replyToId) {
			const { data: target } = await supabase
				.from('messages')
				.select('id')
				.eq('id', replyToId)
				.eq('conversation_id', conversationId)
				.maybeSingle();
			if (!target) {
				return NextResponse.json({ error: 'replyToId is not a message in this conversation' }, { status: 400 });
			}
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
			return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
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
				
				return NextResponse.json({ error: 'Failed to create encrypted message copies' }, { status: 500 });
			}
		} catch (error) {
			console.error('Error in message recipients creation:', error);
			// Clean up the message if recipients creation failed
			await supabase
				.from('messages')
				.delete()
				.eq('id', newMessage.id);
			
			return NextResponse.json({ error: 'Failed to create encrypted message copies' }, { status: 500 });
		}

		// Update sender's activity
		try {
			await supabase.rpc('update_user_activity', { user_uuid: userId });
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

		return NextResponse.json({
			success: true,
			message: newMessage
		});
	} catch (error) {
		console.error('Send message error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});
