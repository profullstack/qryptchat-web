// Public Keys API endpoint
// Handles fetching user public keys for encryption

import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';

// Create service role client instance
const supabaseServiceRole = createServiceRoleClient();

/**
 * GET /api/crypto/public-keys?user_id=xxx
 * Get a single user's public key
 */
export async function GET({ url, locals }) {
	try {
		// Verify user is authenticated
		if (!locals.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const userId = url.searchParams.get('user_id');
		if (!userId) {
			return json({ error: 'Missing user_id parameter' }, { status: 400 });
		}

		// Get the user's auth_user_id from the internal user ID
		const { data: userData, error: userError } = await supabaseServiceRole
			.from('users')
			.select('auth_user_id')
			.eq('id', userId)
			.single();

		if (userError || !userData?.auth_user_id) {
			console.log(`🔑 No auth_user_id found for internal user ${userId}`);
			return json({ public_key: null });
		}

		// Fetch public key using auth_user_id
		const { data: publicKey, error } = await supabaseServiceRole
			.rpc('get_user_public_key', {
				target_user_id: userData.auth_user_id,
				key_type_param: 'ML-KEM-768'
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
export async function POST({ request, locals }) {
	try {
		// Verify user is authenticated
		if (!locals.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { user_ids } = await request.json();
		
		if (!user_ids || !Array.isArray(user_ids)) {
			return json({ error: 'Missing or invalid user_ids array' }, { status: 400 });
		}

		const publicKeys = {};

		// Process each user ID
		for (const userId of user_ids) {
			try {
				// Get the user's auth_user_id from the internal user ID
				const { data: userData, error: userError } = await supabaseServiceRole
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
				const { data: publicKey, error } = await supabaseServiceRole
					.rpc('get_user_public_key', {
						target_user_id: userData.auth_user_id,
						key_type_param: 'ML-KEM-768'
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
 * Upload current user's public key
 */
export async function PUT({ request, locals }) {
	try {
		// Verify user is authenticated
		if (!locals.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { public_key } = await request.json();
		
		if (!public_key) {
			return json({ error: 'Missing public_key' }, { status: 400 });
		}

		// Get current user's auth_user_id
		const { data: userData, error: userError } = await supabaseServiceRole
			.from('users')
			.select('auth_user_id')
			.eq('id', locals.user.id)
			.single();

		if (userError || !userData?.auth_user_id) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Upload public key using auth_user_id
		const { data, error } = await supabaseServiceRole
			.rpc('upsert_user_public_key', {
				target_user_id: userData.auth_user_id,
				public_key_param: public_key,
				key_type_param: 'ML-KEM-768'
			});

		if (error) {
			console.error('Error uploading public key:', error);
			return json({ error: 'Failed to upload public key' }, { status: 500 });
		}

		return json({ success: true });

	} catch (error) {
		console.error('Error in PUT /api/crypto/public-keys:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}