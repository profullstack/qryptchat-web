/**
 * @fileoverview WebSocket messages handler
 * Handles message-related operations like sending, loading, and real-time message updates
 */

import { MESSAGE_TYPES, createSuccessResponse, createErrorResponse } from '../utils/protocol.js';
import { roomManager } from '../utils/rooms.js';
import { isAuthenticated, getAuthenticatedUser, getSupabaseClient } from './auth.js';

/**
 * Handle send message request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Send message request
 * @param {Object} context - WebSocket context
 */
export async function handleSendMessage(ws, message, context) {
	if (!isAuthenticated(context)) {
		const errorResponse = createErrorResponse(
			message.requestId,
			'Authentication required',
			'UNAUTHORIZED'
		);
		ws.send(JSON.stringify(errorResponse));
		return;
	}

	try {
		const { conversationId, content, messageType = 'text', replyToId } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		if (!conversationId || !content) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Conversation ID and content are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Verify user can access this conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id, role')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.single();

		if (participantError || !participant) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Access denied to conversation',
				'ACCESS_DENIED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// TODO: Integrate encryption here
		// For now, we'll store the content as-is (this is the security issue you identified)
		// In production, this should be: encryptedContent = await encryptMessage(content, conversationKey)
		const encryptedContent = content;

		// Insert message into database
		const messageData = {
			conversation_id: conversationId,
			sender_id: user.id,
			message_type: messageType,
			encrypted_content: encryptedContent,
			...(replyToId && { reply_to_id: replyToId }),
			metadata: {},
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
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to send message',
				'DATABASE_ERROR'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Send success response to sender
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.MESSAGE_SENT,
			{
				message: newMessage
			}
		);
		ws.send(JSON.stringify(successResponse));

		// Broadcast message to all participants in the conversation
		const broadcastMessage = {
			type: MESSAGE_TYPES.MESSAGE_RECEIVED,
			payload: {
				message: newMessage
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		roomManager.broadcastToRoom(conversationId, broadcastMessage, ws);

	} catch (error) {
		console.error('Error sending message:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to send message',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle load messages request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Load messages request
 * @param {Object} context - WebSocket context
 */
export async function handleLoadMessages(ws, message, context) {
	if (!isAuthenticated(context)) {
		const errorResponse = createErrorResponse(
			message.requestId,
			'Authentication required',
			'UNAUTHORIZED'
		);
		ws.send(JSON.stringify(errorResponse));
		return;
	}

	try {
		const { conversationId, limit = 50 } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		if (!conversationId) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Conversation ID is required',
				'MISSING_CONVERSATION_ID'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Verify user can access this conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.single();

		if (participantError || !participant) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Access denied to conversation',
				'ACCESS_DENIED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Load messages for the conversation
		const { data: messages, error: messagesError } = await supabase
			.from('messages')
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url)
			`)
			.eq('conversation_id', conversationId)
			.is('deleted_at', null)
			.order('created_at', { ascending: true })
			.limit(limit);

		if (messagesError) {
			console.error('Error loading messages:', messagesError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to load messages',
				'DATABASE_ERROR'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Load reply data separately to avoid PostgREST issues
		let messagesWithReplies = messages || [];
		if (messagesWithReplies.length > 0) {
			const replyIds = messagesWithReplies
				.filter(msg => msg.reply_to_id)
				.map(msg => msg.reply_to_id);

			if (replyIds.length > 0) {
				const { data: replyData } = await supabase
					.from('messages')
					.select('id, encrypted_content, sender_id')
					.in('id', replyIds);

				// Map reply data to messages
				if (replyData) {
					messagesWithReplies.forEach(msg => {
						if (msg.reply_to_id) {
							msg.reply_to = replyData.find(reply => reply.id === msg.reply_to_id);
						}
					});
				}
			}
		}

		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.MESSAGES_LOADED,
			{
				messages: messagesWithReplies,
				conversationId
			}
		);

		ws.send(JSON.stringify(successResponse));

		// Mark messages as read
		if (messagesWithReplies.length > 0) {
			const messageIds = messagesWithReplies
				.filter(msg => msg.sender_id !== user.id)
				.map(msg => msg.id);
			
			if (messageIds.length > 0) {
				await markMessagesAsRead(messageIds, user.id, supabase);
			}
		}

	} catch (error) {
		console.error('Error loading messages:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to load messages',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle load more messages request (pagination)
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Load more messages request
 * @param {Object} context - WebSocket context
 */
export async function handleLoadMoreMessages(ws, message, context) {
	if (!isAuthenticated(context)) {
		const errorResponse = createErrorResponse(
			message.requestId,
			'Authentication required',
			'UNAUTHORIZED'
		);
		ws.send(JSON.stringify(errorResponse));
		return;
	}

	try {
		const { conversationId, beforeMessageId, limit = 50 } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		if (!conversationId || !beforeMessageId) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Conversation ID and beforeMessageId are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Verify user can access this conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.single();

		if (participantError || !participant) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Access denied to conversation',
				'ACCESS_DENIED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Get the timestamp of the before message
		const { data: beforeMessage } = await supabase
			.from('messages')
			.select('created_at')
			.eq('id', beforeMessageId)
			.single();

		if (!beforeMessage) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Before message not found',
				'MESSAGE_NOT_FOUND'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Load older messages
		const { data: messages, error: messagesError } = await supabase
			.from('messages')
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url)
			`)
			.eq('conversation_id', conversationId)
			.is('deleted_at', null)
			.lt('created_at', beforeMessage.created_at)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (messagesError) {
			console.error('Error loading more messages:', messagesError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to load more messages',
				'DATABASE_ERROR'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Load reply data separately
		let messagesWithReplies = messages || [];
		if (messagesWithReplies.length > 0) {
			const replyIds = messagesWithReplies
				.filter(msg => msg.reply_to_id)
				.map(msg => msg.reply_to_id);

			if (replyIds.length > 0) {
				const { data: replyData } = await supabase
					.from('messages')
					.select('id, encrypted_content, sender_id')
					.in('id', replyIds);

				if (replyData) {
					messagesWithReplies.forEach(msg => {
						if (msg.reply_to_id) {
							msg.reply_to = replyData.find(reply => reply.id === msg.reply_to_id);
						}
					});
				}
			}
		}

		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.MESSAGES_LOADED,
			{
				messages: messagesWithReplies.reverse(), // Reverse to maintain chronological order
				conversationId,
				hasMore: messagesWithReplies.length === limit
			}
		);

		ws.send(JSON.stringify(successResponse));

	} catch (error) {
		console.error('Error loading more messages:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to load more messages',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Mark messages as read
 * @param {string[]} messageIds - Array of message IDs
 * @param {string} userId - User ID
 * @param {Object} supabase - Supabase client
 */
async function markMessagesAsRead(messageIds, userId, supabase) {
	try {
		const readStatuses = messageIds.map(messageId => ({
			message_id: messageId,
			user_id: userId,
			status: 'read',
			timestamp: new Date().toISOString()
		}));

		await supabase
			.from('message_status')
			.upsert(readStatuses, { onConflict: 'message_id,user_id' });

	} catch (error) {
		console.error('Failed to mark messages as read:', error);
	}
}