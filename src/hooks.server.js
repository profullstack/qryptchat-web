/**
 * @fileoverview SvelteKit server hooks for Supabase authentication
 * Handles server-side authentication and session management
 */

import { createSupabaseServerClient } from '$lib/supabase.js';
import { redirect } from '@sveltejs/kit';

/**
 * Handle server-side authentication
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<import('@sveltejs/kit').ResolveOptions>}
 */
export async function handle({ event, resolve }) {
	// Create Supabase client for this request
	event.locals.supabase = createSupabaseServerClient(event);

	/**
	 * Helper function to get session
	 * @returns {Promise<import('@supabase/supabase-js').Session | null>}
	 */
	event.locals.getSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		return session;
	};

	// Get session for this request
	const session = await event.locals.getSession();
	event.locals.session = session;
	event.locals.user = session?.user ?? null;

	// Protected routes that require authentication
	const protectedRoutes = ['/chat', '/profile', '/settings'];
	const isProtectedRoute = protectedRoutes.some((route) => event.url.pathname.startsWith(route));

	// Redirect to login if accessing protected route without session
	if (isProtectedRoute && !session) {
		throw redirect(303, '/auth/login');
	}

	// Redirect to chat if accessing auth routes with valid session
	const authRoutes = ['/auth/login', '/auth/register', '/auth/verify'];
	const isAuthRoute = authRoutes.some((route) => event.url.pathname.startsWith(route));

	if (isAuthRoute && session) {
		throw redirect(303, '/chat');
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range';
		}
	});
}