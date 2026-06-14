import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';


export async function GET(request, { params } = {}) {
	try {
		const { userId } = params;
		const supabase = await createSupabaseServerClient();

		// Verify user is authenticated
		const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

		if (authError || !authUser) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}

		const isOwnProfile = userId === authUser.id;

		if (isOwnProfile) {
			// Own profile: return all non-sensitive fields
			const { data: userProfile, error: profileError } = await supabase
				.from('users')
				.select('id, username, display_name, avatar_url, bio, website, unique_identifier, status, is_online, last_seen, last_active_at, sms_notifications_enabled, created_at, updated_at')
				.eq('auth_user_id', authUser.id)
				.single();

			if (profileError) {
				return NextResponse.json({ error: profileError.message }, { status: 404 });
			}

			return NextResponse.json({ user: userProfile });
		}

		// Other user's profile: return only public fields
		const { data: userProfile, error: profileError } = await supabase
			.from('users')
			.select('id, username, display_name, avatar_url, bio, website, unique_identifier, status, is_online')
			.eq('id', userId)
			.single();

		if (profileError) {
			return NextResponse.json({ error: profileError.message }, { status: 404 });
		}

		return NextResponse.json({ user: userProfile });
	} catch (error) {
		console.error('User profile API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}