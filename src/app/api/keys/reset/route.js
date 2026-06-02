/**
 * @fileoverview API endpoint for complete key reset
 * Handles server-side database operations for key regeneration
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { createClient } from '@supabase/supabase-js';

export async function POST(request, { params } = {}) {
	try {
		
		// Get the request body
		const { publicKey } = await request.NextResponse.json();

		if (!publicKey) {
			return NextResponse.json({ error: 'Missing required field: publicKey' }, { status: 400 });
		}

		// Create Supabase client using the server client helper (handles auth automatically)
		const supabase = createSupabaseServerClient();

		// Get the current user from the session
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			console.error('Authentication failed:', authError);
			return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
		}

		console.log('Key reset request for authenticated user:', user.id);

		// Create service role client for database operations
		const serviceSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// Update the user's public key in the database using the proper function
		const { error: updateError } = await serviceSupabase.rpc('upsert_user_public_key', {
			target_user_id: user.id,
			public_key_param: publicKey,
			key_type_param: 'ML-KEM-1024'
		});

		if (updateError) {
			console.error('Database update failed:', updateError);
			return NextResponse.json({ error: `Database update failed: ${updateError.message}` }, { status: 500 });
		}

		return NextResponse.json({ success: true, message: 'Public key updated successfully' });

	} catch (error) {
		console.error('Key reset API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}