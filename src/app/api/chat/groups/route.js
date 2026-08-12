import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';


export async function GET() {
	try {
		const supabase = await createSupabaseServerClient();
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { data: userProfile, error: profileError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (profileError || !userProfile) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}

		// Call the user groups function
		const { data, error } = await supabase.rpc('get_user_groups', {
			user_uuid: userProfile.id
		});

		if (error) {
			console.error('Database error:', error);
			return NextResponse.json({ error: 'Failed to load groups' }, { status: 500 });
		}

		return NextResponse.json({ groups: data || [] });
	} catch (error) {
		console.error('API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
