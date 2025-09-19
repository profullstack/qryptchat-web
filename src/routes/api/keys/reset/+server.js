/**
 * @fileoverview API endpoint for complete key reset
 * Handles server-side database operations for key regeneration
 */

import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	try {
		const { request } = event;

		// Get the request body
		const { publicKey } = await request.json();

		if (!publicKey) {
			return json({ error: 'Missing required field: publicKey' }, { status: 400 });
		}

		// Create Supabase client using the server client helper (handles auth automatically)
		const supabase = createSupabaseServerClient(event);

		// Get the current user from the session
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			console.error('Authentication failed:', authError);
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		console.log('Key reset request for authenticated user:', user.id);

		// Create service role client for database operations
		const serviceSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// Update the user's public key in the database using the proper function
		const { error: updateError } = await serviceSupabase.rpc('upsert_user_public_key', {
			target_user_id: user.id,
			public_key_param: publicKey,
			key_type_param: 'ML-KEM-768'
		});

		if (updateError) {
			console.error('Database update failed:', updateError);
			return json({ error: `Database update failed: ${updateError.message}` }, { status: 500 });
		}

		return json({ success: true, message: 'Public key updated successfully' });

	} catch (error) {
		console.error('Key reset API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}