/**
 * @fileoverview WebSocket authentication middleware
 * Handles JWT token validation and user authentication for WebSocket connections
 */

import { createSupabaseServerClient } from '$lib/supabase.js';

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

		// Create a mock event object for Supabase client
		const mockEvent = {
			request: {
				headers: new Headers({
					authorization: `Bearer ${token}`,
					...request.headers
				})
			},
			cookies: {
				get: (name) => {
					const cookies = request.headers.cookie;
					if (!cookies) return undefined;
					const match = cookies.match(new RegExp(`${name}=([^;]+)`));
					return match ? { value: decodeURIComponent(match[1]) } : undefined;
				}
			}
		};

		const supabase = createSupabaseServerClient(mockEvent);
		
		// Verify the token and get user
		const { data: { user }, error } = await supabase.auth.getUser(token);
		
		if (error || !user) {
			return {
				success: false,
				error: 'Invalid or expired token'
			};
		}

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