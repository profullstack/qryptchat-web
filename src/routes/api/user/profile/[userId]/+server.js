import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	try {
		const { userId } = event.params;
		const supabase = createSupabaseServerClient(event);
		
		// Verify user is authenticated
		const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
		
		if (authError || !authUser) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}
		
		// Get user profile
		const { data: userProfile, error: profileError } = await supabase
			.from('users')
			.select('*')
			.eq('auth_user_id', authUser.id)
			.single();
		
		if (profileError) {
			return json({ error: profileError.message }, { status: 404 });
		}
		
		return json({ user: userProfile });
	} catch (error) {
		console.error('User profile API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}