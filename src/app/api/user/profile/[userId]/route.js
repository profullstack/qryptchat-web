import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';


export async function GET(request, { params } = {}) {
	try {
		const { userId } = params;
		const supabase = createSupabaseServerClient();
		
		// Verify user is authenticated
		const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
		
		if (authError || !authUser) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}
		
		// Get user profile
		const { data: userProfile, error: profileError } = await supabase
			.from('users')
			.select('*')
			.eq('auth_user_id', authUser.id)
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