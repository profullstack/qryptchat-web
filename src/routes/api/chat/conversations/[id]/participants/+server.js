// Conversation Participants API endpoint
// Handles fetching participants for a conversation

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';

// Lazy service role client creation
let supabaseServiceRole = null;
function getServiceRoleClient() {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createServiceRoleClient();
	}
	return supabaseServiceRole;
}

// Create regular client for JWT validation
const supabaseClient = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

/**
 * Authenticate user from request cookies
 * @param {Request} request
 * @returns {Promise<{user?: any, error?: string}>}
 */
async function authenticateUser(request) {
	try {
		// Get access token from cookies
		const cookieHeader = request.headers.get('cookie');
		if (!cookieHeader) {
			return { error: 'No cookies found' };
		}

		// Parse cookies to find auth token
		const cookies = Object.fromEntries(
			cookieHeader.split('; ').map(cookie => {
				const [name, value] = cookie.split('=');
				return [name, decodeURIComponent(value)];
			})
		);

		// Try different cookie sources for the access token
		let accessToken = null;
		
		console.log('🔐 Available cookies:', Object.keys(cookies));
		
		// Try Supabase-specific cookies first
		if (cookies['sb-xydzwxwsbgmznthiiscl-auth-token']) {
			console.log('🔐 Found Supabase auth token cookie');
			try {
				let tokenData = cookies['sb-xydzwxwsbgmznthiiscl-auth-token'];
				if (tokenData.startsWith('base64-')) {
					tokenData = Buffer.from(tokenData.substring(7), 'base64').toString('utf-8');
				}
				const parsed = JSON.parse(tokenData);
				accessToken = parsed.access_token;
				console.log('🔐 Extracted access token from Supabase cookie');
			} catch (error) {
				console.log('🔐 Failed to parse Supabase auth cookie:', error.message);
			}
		}

		// Fallback to session cookie if it looks like a JWT
		if (!accessToken && cookies.session) {
			console.log('🔐 Found session cookie, checking if it\'s a JWT');
			const sessionToken = cookies.session;
			// Basic JWT validation - should have 3 parts
			if (sessionToken.split('.').length === 3) {
				accessToken = sessionToken;
				console.log('🔐 Using session cookie as access token');
			}
		}

		if (!accessToken) {
			console.log('🔐 No access token found');
			return { error: 'No access token found' };
		}

		console.log('🔐 Access token found, validating with Supabase...');

		// Verify the JWT token with regular Supabase client (not service role)
		const { data: { user }, error } = await supabaseClient.auth.getUser(accessToken);

		if (error || !user) {
			console.error('🔐 JWT validation failed:', error);
			return { error: `Invalid token: ${error?.message}` };
		}

		console.log('🔐 JWT validation successful, Supabase Auth user ID:', user.id);

		// Get the internal user record from the auth user ID
		console.log('🔐 Looking up internal user record...');
		const { data: userData, error: userError } = await getServiceRoleClient()
			.from('users')
			.select('id, auth_user_id, username')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !userData) {
			console.error('🔐 Internal user lookup failed:', userError);
			return { error: `No internal user record found: ${userError?.message}` };
		}

		console.log('🔐 Authentication successful, internal user ID:', userData.id);
		return { user: userData };
	} catch (error) {
		return { error: `Authentication error: ${error.message}` };
	}
}

/**
 * GET /api/chat/conversations/[id]/participants
 * Get all participants in a conversation
 */
export async function GET({ params, request }) {
	try {
		// Authenticate user
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const conversationId = params.id;
		if (!conversationId) {
			return json({ error: 'Missing conversation ID' }, { status: 400 });
		}

		// Verify user is a participant in the conversation
		const { data: userParticipant, error: participantError } = await getServiceRoleClient()
			.from('conversation_participants')
			.select('user_id')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.is('left_at', null)
			.single();

		if (participantError || !userParticipant) {
			return json({ error: 'Not authorized to view participants in this conversation' }, { status: 403 });
		}

		// Get all participants in the conversation
		const { data: participants, error } = await getServiceRoleClient()
			.from('conversation_participants')
			.select(`
				user_id,
				role,
				joined_at,
				users!conversation_participants_user_id_fkey(
					id,
					username,
					display_name,
					avatar_url
				)
			`)
			.eq('conversation_id', conversationId)
			.is('left_at', null);

		if (error) {
			console.error('Error fetching conversation participants:', error);
			return json({ error: 'Failed to fetch participants' }, { status: 500 });
		}

		// Transform the data for easier consumption
		const transformedParticipants = participants?.map(participant => ({
			user_id: participant.user_id,
			role: participant.role,
			joined_at: participant.joined_at,
			user: participant.users
		})) || [];

		return json({
			success: true,
			participants: transformedParticipants,
			conversation_id: conversationId
		});

	} catch (error) {
		console.error('Error in GET /api/chat/conversations/[id]/participants:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}