import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.js';

export async function GET(request) {
	try {
		const supabase = createSupabaseClient();
		
		// Get the authenticated user from session
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		
		if (authError || !user) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}
		
		// Get user profile from database
		const { data: profile, error: profileError } = await supabase
			.from('users')
			.select('*')
			.eq('auth_user_id', user.id)
			.single();
		
		if (profileError) {
			console.error('Profile fetch error:', profileError);
			return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
		}
		
		if (!profile) {
			return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
		}
		
		// Return the profile data
		return NextResponse.json(profile);
		
	} catch (error) {
		console.error('Profile API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}