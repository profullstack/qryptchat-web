import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';


export async function GET(request, { params } = {}) {
	try {
		const supabase = await createSupabaseServerClient();
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Call the user groups function
		const { data, error } = await supabase.rpc('get_user_groups', {
			user_uuid: user.id
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