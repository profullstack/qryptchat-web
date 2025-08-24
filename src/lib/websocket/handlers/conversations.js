/**
 * @fileoverview WebSocket conversation handlers
 * Handles conversation-related WebSocket messages
 */

import { createClient } from '@supabase/supabase-js';
import { 
	MESSAGE_TYPES, 
	serializeMessage, 
	createErrorResponse,
	createSuccessResponse 
} from '../utils/protocol.js';
import { roomManager } from '../utils/rooms.js';

/**
 * Get Supabase client for user context
 * @param {Object} context - Connection context
 * @returns {Object} Supabase client
 */
function getSupabaseClient(context) {
	if (!context.supabase && context.user) {
		// Create Supabase client with user's JWT token
		const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
		const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
		
		if (!supabaseUrl || !supabaseKey) {
			throw new Error('Supabase configuration missing');
		}

		context.supabase = createClient(supabaseUrl, supabaseKey, {
			global: {
				headers: {
					Authorization: `Bearer ${context.user.access_token}`
				}
			}
		});
	}
	return context.supabase;
}

/**
 * Handle load conversations request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Parsed message
 * @param {Object} context - Connection context
 */
export async function handleLoadConversations(ws, message, context) {
	try {
		if (!context.authenticated || !context.user) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Authentication required',
				'AUTH_REQUIRED'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		const supabase = getSupabaseClient(context);

		// Call the database function to get user conversations
		const { data: conversations, error } = await supabase
			.rpc('get_user_conversations', {
				user_uuid: context.user.id
			});

		if (error) {
			console.error('Error loading conversations:', error);
			console.error('Error details:', {
				message: error.message,
				code: error.code,
				details: error.details,
				hint: error.hint
			});
			const errorResponse = createErrorResponse(
				message.requestId,
				`Failed to load conversations: ${error.message}`,
				'DATABASE_ERROR'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		console.log('Successfully loaded conversations:', {
			count: conversations?.length || 0,
			conversations: conversations
		});

		const response = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CONVERSATIONS_LOADED,
			{ conversations: conversations || [] }
		);
		ws.send(serializeMessage(response));

	} catch (error) {
		console.error('Error in handleLoadConversations:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Internal server error',
			'SERVER_ERROR'
		);
		ws.send(serializeMessage(errorResponse));
	}
}

/**
 * Handle join conversation request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Parsed message
 * @param {Object} context - Connection context
 */
export async function handleJoinConversation(ws, message, context) {
	try {
		if (!context.authenticated || !context.user) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Authentication required',
				'AUTH_REQUIRED'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		const { conversationId } = message.payload;
		if (!conversationId) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Conversation ID required',
				'INVALID_DATA'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		const supabase = getSupabaseClient(context);

		// Verify user has access to this conversation
		const { data: participant, error } = await supabase
			.from('conversation_participants')
			.select('*')
			.eq('conversation_id', conversationId)
			.eq('user_id', context.user.id)
			.single();

		if (error || !participant) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Access denied to conversation',
				'ACCESS_DENIED'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		// Add user to conversation room
		roomManager.joinRoom(ws, conversationId, context.user.id);

		const response = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CONVERSATION_JOINED,
			{ conversationId }
		);
		ws.send(serializeMessage(response));

	} catch (error) {
		console.error('Error in handleJoinConversation:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Internal server error',
			'SERVER_ERROR'
		);
		ws.send(serializeMessage(errorResponse));
	}
}

/**
 * Handle leave conversation request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Parsed message
 * @param {Object} context - Connection context
 */
export async function handleLeaveConversation(ws, message, context) {
	try {
		if (!context.authenticated || !context.user) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Authentication required',
				'AUTH_REQUIRED'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		const { conversationId } = message.payload;
		if (!conversationId) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Conversation ID required',
				'INVALID_DATA'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		// Remove user from conversation room
		roomManager.leaveRoom(ws, conversationId);

		const response = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CONVERSATION_LEFT,
			{ conversationId }
		);
		ws.send(serializeMessage(response));

	} catch (error) {
		console.error('Error in handleLeaveConversation:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Internal server error',
			'SERVER_ERROR'
		);
		ws.send(serializeMessage(errorResponse));
	}
}

/**
 * Handle create conversation request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Parsed message
 * @param {Object} context - Connection context
 */
export async function handleCreateConversation(ws, message, context) {
	try {
		if (!context.authenticated || !context.user) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Authentication required',
				'AUTH_REQUIRED'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		const { participantIds, name, isGroup } = message.payload;
		if (!participantIds || !Array.isArray(participantIds)) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Participant IDs required',
				'INVALID_DATA'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		const supabase = getSupabaseClient(context);

		// Determine conversation type and data
		const isDirectMessage = !isGroup && participantIds.length === 1;
		const conversationData = {
			type: isDirectMessage ? 'direct' : 'room',
			name: isDirectMessage ? null : (name || null), // Direct messages don't have names
			is_private: !isGroup, // Direct messages are private by default
			created_by: context.user.id
		};

		const { data: conversation, error: conversationError } = await supabase
			.from('conversations')
			.insert(conversationData)
			.select()
			.single();

		if (conversationError) {
			console.error('Error creating conversation:', conversationError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to create conversation',
				'DATABASE_ERROR'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		// Add participants (including creator)
		const allParticipantIds = [...new Set([context.user.id, ...participantIds])];
		const participantData = allParticipantIds.map(userId => ({
			conversation_id: conversation.id,
			user_id: userId,
			joined_at: new Date().toISOString()
		}));

		const { error: participantError } = await supabase
			.from('conversation_participants')
			.insert(participantData);

		if (participantError) {
			console.error('Error adding participants:', participantError);
			// Try to clean up the conversation
			await supabase.from('conversations').delete().eq('id', conversation.id);
			
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to add participants',
				'DATABASE_ERROR'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		// Join the creator to the conversation room
		roomManager.joinRoom(ws, conversation.id, context.user.id);

		const response = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CONVERSATION_CREATED,
			{ conversation }
		);
		ws.send(serializeMessage(response));

	} catch (error) {
		console.error('Error in handleCreateConversation:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Internal server error',
			'SERVER_ERROR'
		);
		ws.send(serializeMessage(errorResponse));
	}
}
