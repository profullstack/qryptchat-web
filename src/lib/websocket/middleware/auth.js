/**
 * @fileoverview WebSocket authentication middleware
 * Handles JWT token validation and user authentication for WebSocket connections
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Extract JWT token from WebSocket request
 * @param {Object} request - WebSocket upgrade request
 * @returns {string|null} JWT token or null if not found
 */
function extractToken(request) {
	// Try to get token from Authorization header
	const authHeader = request.headers.authorization;
	if (authHeader && authHeader.startsWith('Bearer ')) {
		return authHeader.substring(7);
	}

	// Try to get token from query parameters
	const url = new URL(request.url, `http://${request.headers.host}`);
	const tokenFromQuery = url.searchParams.get('token');
	if (tokenFromQuery) {
		return tokenFromQuery;
	}

	// Try to get token from cookies
	const cookies = request.headers.cookie;
	if (cookies) {
		const tokenMatch = cookies.match(/sb-access-token=([^;]+)/);
		if (tokenMatch) {
			return decodeURIComponent(tokenMatch[1]);
		}
	}

	return null;
}

/**
 * Authenticate WebSocket connection
 * @param {Object} request - WebSocket upgrade request
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
export async function authenticateWebSocket(request) {
	try {
		const token = extractToken(request);
		if (!token) {
			return {
				success: false,
				error: 'No authentication token provided'
			};
		}

		// Get Supabase configuration from environment
		// Try both PUBLIC_ prefixed and non-prefixed versions
		const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
		const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
		
		if (!supabaseUrl || !supabaseKey) {
			console.error('Supabase configuration missing:', {
				url: !!supabaseUrl,
				key: !!supabaseKey,
				env: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
			});
			return {
				success: false,
				error: 'Server configuration error'
			};
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
			return {
				success: false,
				error: 'Invalid or expired token'
			};
		}

		// Add the access token to the user object for later use
		user.access_token = token;

		return {
			success: true,
			user
		};
	} catch (error) {
		console.error('WebSocket authentication error:', error);
		return {
			success: false,
			error: 'Authentication failed'
		};
	}
}

/**
 * Middleware to authenticate WebSocket messages
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Incoming message
 * @param {Object} user - Authenticated user
 * @returns {boolean} True if authorized
 */
export function authorizeMessage(ws, message, user) {
	// For now, all authenticated users can send any message
	// This can be extended with more granular permissions
	return Boolean(user && user.id);
}

/**
 * Check if user can access a conversation
 * @param {string} userId - User ID
 * @param {string} conversationId - Conversation ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<boolean>} True if user can access conversation
 */
export async function canAccessConversation(userId, conversationId, supabase) {
	try {
		// Check if user is a participant in the conversation
		const { data, error } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', userId)
			.single();

		if (error && error.code !== 'PGRST116') {
			console.error('Error checking conversation access:', error);
			return false;
		}

		return Boolean(data);
	} catch (error) {
		console.error('Error checking conversation access:', error);
		return false;
	}
}

/**
 * Check if user can access a group
 * @param {string} userId - User ID
 * @param {string} groupId - Group ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<boolean>} True if user can access group
 */
export async function canAccessGroup(userId, groupId, supabase) {
	try {
		// Check if user is a member of the group
		const { data, error } = await supabase
			.from('group_members')
			.select('id')
			.eq('group_id', groupId)
			.eq('user_id', userId)
			.single();

		if (error && error.code !== 'PGRST116') {
			console.error('Error checking group access:', error);
			return false;
		}

		return Boolean(data);
	} catch (error) {
		console.error('Error checking group access:', error);
		return false;
	}
}