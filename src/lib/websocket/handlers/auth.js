/**
 * @fileoverview WebSocket authentication handler
 * Handles user authentication and connection setup
 */

import { createClient } from '@supabase/supabase-js';
import { MESSAGE_TYPES, createSuccessResponse, createErrorResponse, serializeMessage } from '../utils/protocol.js';
import { roomManager } from '../utils/rooms.js';

/**
 * Handle authentication message
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Authentication message
 * @param {Object} context - WebSocket context
 */
export async function handleAuth(ws, message, context) {
	try {
		const { token } = message.payload;
		
		if (!token) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Authentication token is required',
				'MISSING_TOKEN'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		// Get Supabase configuration from environment
		const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
		const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
		
		if (!supabaseUrl || !supabaseKey) {
			console.error('Supabase configuration missing');
			const errorResponse = createErrorResponse(
				message.requestId,
				'Server configuration error',
				'CONFIG_ERROR'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		// Create Supabase client with the token
		const supabase = createClient(supabaseUrl, supabaseKey, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`
				}
			}
		});
		
		// Verify the token and get user
		const { data: { user }, error } = await supabase.auth.getUser(token);
		
		if (error || !user) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Invalid or expired token',
				'INVALID_TOKEN'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		// Add the access token to the user object for later use
		user.access_token = token;

		// Store user info in WebSocket context
		context.user = user;
		context.supabase = supabase;
		context.authenticated = true;

		// Add user connection to room manager
		roomManager.addUserConnection(ws, user.id);

		// Send success response
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.AUTH_SUCCESS,
			{
				user: {
					id: user.id,
					email: user.email,
					phone: user.phone
				}
			}
		);
		
		ws.send(serializeMessage(successResponse));

		// Broadcast user online status to relevant conversations
		await broadcastUserOnlineStatus(user.id, true, supabase);

	} catch (error) {
		console.error('Authentication error:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Authentication failed',
			'AUTH_ERROR'
		);
		ws.send(serializeMessage(errorResponse));
	}
}

/**
 * Handle user disconnection
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} context - WebSocket context
 */
export async function handleDisconnect(ws, context) {
	try {
		if (context.user && context.supabase) {
			// Broadcast user offline status
			await broadcastUserOnlineStatus(context.user.id, false, context.supabase);
		}

		// Remove user connection from room manager
		roomManager.removeUserConnection(ws);

	} catch (error) {
		console.error('Disconnect handling error:', error);
	}
}

/**
 * Broadcast user online/offline status to relevant conversations
 * @param {string} userId - User ID
 * @param {boolean} isOnline - Online status
 * @param {Object} supabase - Supabase client
 */
async function broadcastUserOnlineStatus(userId, isOnline, supabase) {
	try {
		// Get all conversations the user is part of
		const { data: conversations, error } = await supabase
			.from('conversation_participants')
			.select('conversation_id')
			.eq('user_id', userId);

		if (error || !conversations) {
			console.error('Error fetching user conversations for presence:', error);
			return;
		}

		// Broadcast presence update to each conversation
		for (const conv of conversations) {
			const presenceMessage = {
				type: isOnline ? MESSAGE_TYPES.USER_ONLINE : MESSAGE_TYPES.USER_OFFLINE,
				payload: {
					userId,
					conversationId: conv.conversation_id,
					timestamp: new Date().toISOString()
				},
				requestId: null,
				timestamp: new Date().toISOString()
			};

			roomManager.broadcastToRoom(conv.conversation_id, presenceMessage);
		}
	} catch (error) {
		console.error('Error broadcasting user presence:', error);
	}
}

/**
 * Check if WebSocket connection is authenticated
 * @param {Object} context - WebSocket context
 * @returns {boolean} True if authenticated
 */
export function isAuthenticated(context) {
	return Boolean(context.authenticated && context.user && context.supabase);
}

/**
 * Get authenticated user from context
 * @param {Object} context - WebSocket context
 * @returns {Object|null} User object or null
 */
export function getAuthenticatedUser(context) {
	return context.user || null;
}

/**
 * Get Supabase client from context
 * @param {Object} context - WebSocket context
 * @returns {Object|null} Supabase client or null
 */
export function getSupabaseClient(context) {
	return context.supabase || null;
}