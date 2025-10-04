/**
 * @fileoverview API authentication middleware
 * Handles JWT token validation for API requests
 */

import { createSupabaseServerClient } from '$lib/supabase.js';

/**
 * Authenticate API request
 * @param {Object} event - SvelteKit request event
 * @returns {Promise<{success: boolean, user?: Object, supabase?: Object, error?: string}>}
 */
export async function authenticateRequest(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const { data: { session }, error } = await supabase.auth.getSession();

		if (error || !session) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}

		return {
			success: true,
			user: session.user,
			supabase
		};
	} catch (error) {
		console.error('Authentication error:', error);
		return {
			success: false,
			error: 'Authentication failed'
		};
	}
}

/**
 * Middleware wrapper for authenticated routes
 * @param {Function} handler - Route handler function
 * @returns {Function} Wrapped handler
 */
export function withAuth(handler) {
	return async (event) => {
		const auth = await authenticateRequest(event);
		
		if (!auth.success) {
			return new Response(JSON.stringify({ error: auth.error }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Add auth info to event locals
		event.locals.user = auth.user;
		event.locals.supabase = auth.supabase;

		return handler(event);
	};
}