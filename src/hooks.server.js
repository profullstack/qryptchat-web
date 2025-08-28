/**
 * SvelteKit Server Hooks
 * Handles server-side logic including www to non-www redirects and authentication
 */

import { createServiceRoleClient } from '$lib/supabase/service-role.js';

// Create service role client instance
const supabaseServiceRole = createServiceRoleClient();

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// Get the host from the request headers
	const host = event.request.headers.get('host');
	
	// Check if the request is coming from www subdomain
	if (host && host.startsWith('www.')) {
		// Extract the domain without www
		const nonWwwHost = host.slice(4); // Remove 'www.' prefix
		
		// Construct the redirect URL
		const redirectUrl = new URL(event.url);
		redirectUrl.host = nonWwwHost;
		
		// Return a 301 permanent redirect
		return new Response(null, {
			status: 301,
			headers: {
				location: redirectUrl.toString()
			}
		});
	}

	// Handle authentication for API routes only
	if (event.url.pathname.startsWith('/api/')) {
		await handleAuthentication(event);
	}
	
	// Continue with normal request handling
	return resolve(event);
}

/**
 * Handle authentication by extracting JWT from cookies and validating with Supabase
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
async function handleAuthentication(event) {
	try {
		// Get the access token from cookies
		const accessToken = event.cookies.get('sb-access-token') ||
						   event.cookies.get('supabase-auth-token') ||
						   extractTokenFromCookie(event.cookies.get('sb-xydzwxwsbgmznthiiscl-auth-token'));

		if (!accessToken) {
			console.log('🔐 No access token found in cookies');
			return;
		}

		// Verify the JWT token with Supabase
		const { data: { user }, error } = await supabaseServiceRole.auth.getUser(accessToken);

		if (error || !user) {
			console.log('🔐 Invalid or expired token:', error?.message);
			return;
		}

		// Get the internal user record from the auth user ID
		const { data: userData, error: userError } = await supabaseServiceRole
			.from('users')
			.select('id, auth_user_id, email, username')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !userData) {
			console.log('🔐 No internal user record found for auth user:', user.id);
			return;
		}

		// Set the user in locals for API routes to access
		event.locals.user = {
			id: userData.id,
			auth_user_id: userData.auth_user_id,
			email: userData.email,
			username: userData.username
		};

		console.log('🔐 ✅ Authenticated user:', userData.username || userData.email);

	} catch (error) {
		console.error('🔐 ❌ Authentication error:', error);
	}
}

/**
 * Extract access token from Supabase auth cookie JSON
 * @param {string|undefined} cookieValue
 * @returns {string|null}
 */
function extractTokenFromCookie(cookieValue) {
	if (!cookieValue) return null;
	
	try {
		const parsed = JSON.parse(cookieValue);
		return parsed.access_token || null;
	} catch (error) {
		return null;
	}
}