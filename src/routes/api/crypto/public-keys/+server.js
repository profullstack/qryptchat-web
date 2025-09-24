// Public Keys API endpoint
// Handles fetching user public keys for encryption

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
		
		// Try Supabase-specific cookies first
		if (cookies['sb-xydzwxwsbgmznthiiscl-auth-token']) {
			try {
				let tokenData = cookies['sb-xydzwxwsbgmznthiiscl-auth-token'];
				if (tokenData.startsWith('base64-')) {
					tokenData = Buffer.from(tokenData.substring(7), 'base64').toString('utf-8');
				}
				const parsed = JSON.parse(tokenData);
				accessToken = parsed.access_token;
			} catch (error) {
				console.log('Failed to parse Supabase auth cookie:', error.message);
			}
		}

		// Fallback to session cookie if it looks like a JWT
		if (!accessToken && cookies.session) {
			const sessionToken = cookies.session;
			// Basic JWT validation - should have 3 parts
			if (sessionToken.split('.').length === 3) {
				accessToken = sessionToken;
			}
		}

		if (!accessToken) {
			return { error: 'No access token found' };
		}

		// Verify the JWT token with regular Supabase client (not service role)
		const { data: { user }, error } = await supabaseClient.auth.getUser(accessToken);

		if (error || !user) {
			return { error: `Invalid token: ${error?.message}` };
		}

		// Get the internal user record from the auth user ID
		const { data: userData, error: userError } = await getServiceRoleClient()
			.from('users')
			.select('id, auth_user_id, username')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !userData) {
			return { error: `No internal user record found: ${userError?.message}` };
		}

		return { user: userData };
	} catch (error) {
		return { error: `Authentication error: ${error.message}` };
	}
}

/**
 * GET /api/crypto/public-keys?user_id=xxx
 * Get a single user's public key
 */
export async function GET({ url, request }) {
	try {
		// Authenticate user
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const userId = url.searchParams.get('user_id');
		if (!userId) {
			return json({ error: 'Missing user_id parameter' }, { status: 400 });
		}

		// Get the user's auth_user_id from the internal user ID
		const { data: userData, error: userError } = await getServiceRoleClient()
			.from('users')
			.select('auth_user_id')
			.eq('id', userId)
			.single();

		if (userError || !userData?.auth_user_id) {
			console.log(`🔑 No auth_user_id found for internal user ${userId}`);
			return json({ public_key: null });
		}

		// Fetch public key using auth_user_id
		const { data: publicKey, error } = await getServiceRoleClient()
			.rpc('get_user_public_key', {
				target_user_id: userData.auth_user_id,
				key_type_param: 'ML-KEM-1024'
			});

		if (error) {
			console.error('Error fetching public key:', error);
			return json({ error: 'Failed to fetch public key' }, { status: 500 });
		}

		return json({ 
			public_key: publicKey,
			user_id: userId
		});

	} catch (error) {
		console.error('Error in GET /api/crypto/public-keys:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * POST /api/crypto/public-keys
 * Get multiple users' public keys
 */
export async function POST({ request }) {
	try {
		// Authenticate user
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { user_ids } = await request.json();
		
		if (!user_ids || !Array.isArray(user_ids)) {
			return json({ error: 'Missing or invalid user_ids array' }, { status: 400 });
		}

		/** @type {Record<string, string|null>} */
		const publicKeys = {};

		// Process each user ID
		for (const userId of user_ids) {
			try {
				// Get the user's auth_user_id from the internal user ID
				const { data: userData, error: userError } = await getServiceRoleClient()
					.from('users')
					.select('auth_user_id')
					.eq('id', userId)
					.single();

				if (userError || !userData?.auth_user_id) {
					console.log(`🔑 No auth_user_id found for internal user ${userId}`);
					publicKeys[userId] = null;
					continue;
				}

				// Fetch public key using auth_user_id
				const { data: publicKey, error } = await getServiceRoleClient()
					.rpc('get_user_public_key', {
						target_user_id: userData.auth_user_id,
						key_type_param: 'ML-KEM-1024'
					});

				if (error) {
					console.error(`Error fetching public key for user ${userId}:`, error);
					publicKeys[userId] = null;
				} else {
					publicKeys[userId] = publicKey;
				}

			} catch (error) {
				console.error(`Error processing user ${userId}:`, error);
				publicKeys[userId] = null;
			}
		}

		return json({ public_keys: publicKeys });

	} catch (error) {
		console.error('Error in POST /api/crypto/public-keys:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * PUT /api/crypto/public-keys
 * Update/sync user's public key to database
 */
export async function PUT({ request }) {
	try {
		// Authenticate user
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { public_key, key_type = 'ML-KEM-1024' } = await request.json();
		
		if (!public_key) {
			return json({ error: 'Missing public_key' }, { status: 400 });
		}

		// Sync public key to database using the upsert function
		const { data: result, error } = await getServiceRoleClient()
			.rpc('upsert_user_public_key', {
				target_user_id: user.auth_user_id, // Use auth_user_id for the function
				public_key_param: public_key,
				key_type_param: key_type
			});

		if (error) {
			console.error('Error syncing public key:', error);
			return json({ error: 'Failed to sync public key' }, { status: 500 });
		}

		console.log(`🔑 ✅ Successfully synced public key for user ${user.id} (${user.username})`);
		
		return json({
			success: true,
			message: 'Public key synced successfully',
			key_id: result
		});

	} catch (error) {
		console.error('Error in PUT /api/crypto/public-keys:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}