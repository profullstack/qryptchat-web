import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Call the user groups function
		const { data, error } = await supabase.rpc('get_user_groups', {
			user_uuid: user.id
		});

		if (error) {
			console.error('Database error:', error);
			return json({ error: 'Failed to load groups' }, { status: 500 });
		}

		return json({ groups: data || [] });
	} catch (error) {
		console.error('API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}