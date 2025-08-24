/**
 * @fileoverview WebSocket typing indicators handler
 * Handles typing start/stop events and broadcasts typing status to conversation participants
 */

import { MESSAGE_TYPES, createSuccessResponse, createErrorResponse } from '../utils/protocol.js';
import { roomManager } from '../utils/rooms.js';
import { isAuthenticated, getAuthenticatedUser, getSupabaseClient } from './auth.js';

/**
 * Handle typing start request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Typing start message
 * @param {Object} context - WebSocket context
 */
export async function handleTypingStart(ws, message, context) {
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
		const { conversationId } = message.payload;
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
		// Use the internal user ID (not auth_user_id) for conversation_participants lookup
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

		// Update typing indicator in database
		await supabase
			.from('typing_indicators')
			.upsert(
				{
					conversation_id: conversationId,
					user_id: user.id,
					is_typing: true,
					updated_at: new Date().toISOString()
				},
				{ onConflict: 'conversation_id,user_id' }
			);

		// Broadcast typing update to other participants
		const typingMessage = {
			type: MESSAGE_TYPES.TYPING_UPDATE,
			payload: {
				conversationId,
				userId: user.id,
				username: user.username || user.display_name || user.email,
				isTyping: true
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		roomManager.broadcastToRoom(conversationId, typingMessage, ws);

		// Send success response
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.TYPING_START,
			{
				conversationId,
				isTyping: true
			}
		);

		ws.send(JSON.stringify(successResponse));

	} catch (error) {
		console.error('Error handling typing start:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to start typing indicator',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle typing stop request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Typing stop message
 * @param {Object} context - WebSocket context
 */
export async function handleTypingStop(ws, message, context) {
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
		const { conversationId } = message.payload;
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

		// Update typing indicator in database
		await supabase
			.from('typing_indicators')
			.upsert(
				{
					conversation_id: conversationId,
					user_id: user.id,
					is_typing: false,
					updated_at: new Date().toISOString()
				},
				{ onConflict: 'conversation_id,user_id' }
			);

		// Broadcast typing update to other participants
		const typingMessage = {
			type: MESSAGE_TYPES.TYPING_UPDATE,
			payload: {
				conversationId,
				userId: user.id,
				username: user.username || user.display_name || user.email,
				isTyping: false
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		roomManager.broadcastToRoom(conversationId, typingMessage, ws);

		// Send success response
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.TYPING_STOP,
			{
				conversationId,
				isTyping: false
			}
		);

		ws.send(JSON.stringify(successResponse));

	} catch (error) {
		console.error('Error handling typing stop:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to stop typing indicator',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Clean up typing indicators for a user when they disconnect
 * @param {string} userId - User ID
 * @param {Object} supabase - Supabase client
 */
export async function cleanupTypingIndicators(userId, supabase) {
	try {
		await supabase
			.from('typing_indicators')
			.update({ is_typing: false, updated_at: new Date().toISOString() })
			.eq('user_id', userId)
			.eq('is_typing', true);
	} catch (error) {
		console.error('Error cleaning up typing indicators:', error);
	}
}

/**
 * Auto-cleanup typing indicators that are older than 30 seconds
 * This should be called periodically to clean up stale typing indicators
 * @param {Object} supabase - Supabase client
 */
export async function cleanupStaleTypingIndicators(supabase) {
	try {
		const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
		
		await supabase
			.from('typing_indicators')
			.update({ is_typing: false })
			.eq('is_typing', true)
			.lt('updated_at', thirtySecondsAgo);
	} catch (error) {
		console.error('Error cleaning up stale typing indicators:', error);
	}
}