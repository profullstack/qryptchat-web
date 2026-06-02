import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export async function GET(request, { params } = {}) {
	try {
		// Create service role client for admin access to all user data
		const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// Get all users with public keys
		const { data: users, error } = await supabase
			.from('user_public_keys')
			.select('user_id, public_key')
			.not('public_key', 'is', null);

		if (error) {
			console.error('Failed to fetch all user keys:', error);
			return NextResponse.json({ error: 'Failed to fetch user keys' }, { status: 500 });
		}

		// Transform the data to match expected format
		const userKeys = users.map(user => ({
			user_id: user.user_id,
			public_key: user.public_key
		}));

		console.log(`📊 Retrieved ${userKeys.length} users with public keys`);
		return NextResponse.json(userKeys);

	} catch (error) {
		console.error('Error in public-keys/all endpoint:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}