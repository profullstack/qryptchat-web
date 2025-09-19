/**
 * @fileoverview API endpoint for deleting user keys
 * Handles server-side database operations for key deletion
 */

import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	try {
		// Create Supabase client using the server client helper (handles auth automatically)
		const supabase = createSupabaseServerClient(event);

		// Get the current user from the session
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			console.error('Authentication failed:', authError);
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		console.log('Key deletion request for authenticated user:', user.id);

		// Create service role client for database operations
		const serviceSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// Delete the user's public key from the database
		const { error: deleteError } = await serviceSupabase
			.from('user_profiles')
			.update({ 
				ml_kem_public_key: null,
				updated_at: new Date().toISOString()
			})
			.eq('user_id', user.id);

		if (deleteError) {
			console.error('Database deletion failed:', deleteError);
			return json({ error: `Database deletion failed: ${deleteError.message}` }, { status: 500 });
		}

		console.log('Successfully deleted public key for user:', user.id);
		return json({ success: true, message: 'Public key deleted successfully' });

	} catch (error) {
		console.error('Key deletion API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}