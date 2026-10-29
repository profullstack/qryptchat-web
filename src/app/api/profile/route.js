import { NextResponse } from 'next/server';
import { createSupabaseServerClientWithToken } from '@/lib/supabase.js';
import { bearerToken } from '@/lib/auth/bearer.js';
import { PUBLIC_PROFILE_COLUMNS } from '@/lib/profile/fields.js';

/**
 * GET /api/profile: the caller's own public profile, found by token rather
 * than username, so a client that cached an old username (qc after a rename)
 * still finds itself.
 */
export async function GET(request) {
	try {
		const token = bearerToken(request);
		if (!token) {
			return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
		}
		const supabase = await createSupabaseServerClientWithToken(token);
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);
		if (authError || !user) {
			return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
		}
		const { data, error } = await supabase.from('users').select(PUBLIC_PROFILE_COLUMNS).eq('auth_user_id', user.id).single();
		if (error || !data) return NextResponse.json({ error: 'User not found' }, { status: 404 });
		return NextResponse.json({ user: data });
	} catch (err) {
		console.error('Profile read error:', err);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
