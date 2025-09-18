import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	try {
		// Create service role client for admin access to all user data
		const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// Get all users with public keys
		const { data: users, error } = await supabase
			.from('user_profiles')
			.select('user_id, ml_kem_public_key')
			.not('ml_kem_public_key', 'is', null);

		if (error) {
			console.error('Failed to fetch all user keys:', error);
			return json({ error: 'Failed to fetch user keys' }, { status: 500 });
		}

		// Transform the data to match expected format
		const userKeys = users.map(user => ({
			user_id: user.user_id,
			public_key: user.ml_kem_public_key
		}));

		console.log(`📊 Retrieved ${userKeys.length} users with public keys`);
		return json(userKeys);

	} catch (error) {
		console.error('Error in public-keys/all endpoint:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}