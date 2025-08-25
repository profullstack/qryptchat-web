/**
 * @fileoverview WebSocket authentication handler
 * Handles user authentication and connection setup
 */

import { createClient } from '@supabase/supabase-js';
import { MESSAGE_TYPES, createMessage, createSuccessResponse, createErrorResponse, serializeMessage } from '../utils/protocol.js';
import { roomManager } from '../utils/rooms.js';

/**
 * Handle authentication message
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Authentication message
 * @param {Object} context - WebSocket context
 */
export async function handleAuth(ws, message, context) {
	console.log('🔐 [AUTH] ==================== AUTHENTICATION START ====================');
	console.log('🔐 [AUTH] Message received:', JSON.stringify(message, null, 2));
	
	try {
		const { token } = message.payload;
		
		console.log('🔐 [AUTH] Token extraction:', {
			hasToken: !!token,
			tokenLength: token?.length || 0,
			tokenStart: token?.substring(0, 20) + '...' || 'N/A'
		});
		
		if (!token) {
			console.error('🔐 [AUTH] ERROR: No token provided in payload');
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
		
		console.log('🔐 [AUTH] Environment check:', {
			hasSupabaseUrl: !!supabaseUrl,
			hasSupabaseKey: !!supabaseKey,
			supabaseUrl: supabaseUrl || 'MISSING'
		});
		
		if (!supabaseUrl || !supabaseKey) {
			console.error('🔐 [AUTH] ERROR: Supabase configuration missing');
			const errorResponse = createErrorResponse(
				message.requestId,
				'Server configuration error',
				'CONFIG_ERROR'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}

		// Create Supabase client with the token
		console.log('🔐 [AUTH] Creating Supabase client...');
		const supabase = createClient(supabaseUrl, supabaseKey, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`
				}
			}
		});
		
		// Verify the token and get user
		console.log('🔐 [AUTH] Calling supabase.auth.getUser()...');
		const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
		
		console.log('🔐 [AUTH] Auth response:', {
			hasAuthUser: !!authUser,
			authUserId: authUser?.id || 'N/A',
			authUserEmail: authUser?.email || 'N/A',
			error: error ? {
				message: error.message,
				status: error.status,
				code: error.code
			} : null
		});
		
		if (error || !authUser) {
			console.error('🔐 [AUTH] ERROR: Authentication failed');
			console.error('🔐 [AUTH] Auth error details:', error);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Invalid or expired token',
				'INVALID_TOKEN'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}
	
		// Get the internal user record that corresponds to this auth user
		console.log('🔐 [AUTH] Querying users table for auth_user_id:', authUser.id);
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('*')
			.eq('auth_user_id', authUser.id)
			.single();
	
		console.log('🔐 [AUTH] Internal user query result:', {
			hasInternalUser: !!internalUser,
			internalUserId: internalUser?.id || 'N/A',
			internalUserUsername: internalUser?.username || 'N/A',
			internalUserAuthId: internalUser?.auth_user_id || 'N/A',
			userError: userError ? {
				message: userError.message,
				code: userError.code,
				details: userError.details,
				hint: userError.hint
			} : null
		});
	
		if (userError || !internalUser) {
			console.error('🔐 [AUTH] ERROR: Internal user not found for auth user:', authUser.id);
			console.error('🔐 [AUTH] User error details:', userError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'User profile not found',
				'USER_NOT_FOUND'
			);
			ws.send(serializeMessage(errorResponse));
			return;
		}
	
		// Create a combined user object with both auth and internal user data
		console.log('🔐 [AUTH] Creating combined user object...');
		console.log('🔐 [AUTH] authUser object:', {
			id: authUser.id,
			email: authUser.email,
			keys: Object.keys(authUser)
		});
		console.log('🔐 [AUTH] internalUser object:', {
			id: internalUser.id,
			username: internalUser.username,
			auth_user_id: internalUser.auth_user_id,
			keys: Object.keys(internalUser)
		});
		
		// IMPORTANT: We need to ensure the internal user ID takes precedence
		const user = {
			...authUser,           // Spread auth user data (email, etc.)
			...internalUser,       // Spread internal user data (this should override id with internal ID)
			id: internalUser.id,   // EXPLICITLY set the internal user ID
			auth_user_id: authUser.id, // Keep the auth ID for reference
			access_token: token
		};
		
		console.log('🔐 [AUTH] Combined user object:', {
			id: user.id,
			auth_user_id: user.auth_user_id,
			username: user.username,
			email: user.email,
			display_name: user.display_name,
			phone_number: user.phone_number
		});
		
		console.log('🔐 [AUTH] ID verification:', {
			finalUserId: user.id,
			internalUserId: internalUser.id,
			authUserId: authUser.id,
			idsMatch: user.id === internalUser.id
		});
	
		// Store user info in WebSocket context
		context.user = user;
		context.supabase = supabase;
		context.authenticated = true;
	
		// Add user connection to room manager using the internal user ID
		roomManager.addUserConnection(ws, internalUser.id);

		// Send success response
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.AUTH_SUCCESS,
			{
				user: {
					id: user.id, // This is now the internal user ID
					auth_user_id: user.auth_user_id, // Supabase auth ID
					email: user.email || authUser.email,
					phone: user.phone_number,
					username: user.username,
					display_name: user.display_name
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
			const presenceMessage = createMessage(
				isOnline ? MESSAGE_TYPES.USER_ONLINE : MESSAGE_TYPES.USER_OFFLINE,
				{
					userId,
					conversationId: conv.conversation_id,
					timestamp: new Date().toISOString()
				}
			);

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