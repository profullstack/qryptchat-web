/**
 * @fileoverview API endpoint for deleting user keys
 * Handles server-side database operations for key deletion
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
	try {
		// Create Supabase client using the server client helper (handles auth automatically)
		const supabase = await createSupabaseServerClient();

		// Get the current user from the session
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			console.error('Authentication failed:', authError);
			return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
		}

		console.log('Key deletion request for authenticated user:', user.id);

		// Create service role client for database operations
		const serviceSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// Delete the user's public key from the database
		const { error: deleteError } = await serviceSupabase
			.from('user_public_keys')
			.delete()
			.eq('user_id', user.id);

		if (deleteError) {
			console.error('Database deletion failed:', deleteError);
			return NextResponse.json({ error: `Database deletion failed: ${deleteError.message}` }, { status: 500 });
		}

		console.log('Successfully deleted public key for user:', user.id);
		return NextResponse.json({ success: true, message: 'Public key deleted successfully' });

	} catch (error) {
		console.error('Key deletion API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
