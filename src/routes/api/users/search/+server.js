import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const url = new URL(event.request.url);
		const query = url.searchParams.get('q');
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (!query || query.trim().length < 2) {
			return json({ users: [] });
		}

		// Search users by username, display_name, or phone
		const { data, error } = await supabase
			.from('users')
			.select('id, username, display_name, avatar_url, phone')
			.or(`username.ilike.%${query}%,display_name.ilike.%${query}%,phone.ilike.%${query}%`)
			.neq('id', user.id) // Exclude current user
			.limit(10);

		if (error) {
			console.error('Database error:', error);
			return json({ error: 'Failed to search users' }, { status: 500 });
		}

		// Filter out sensitive information and format results
		const users = (data || []).map(u => ({
			id: u.id,
			username: u.username,
			display_name: u.display_name,
			avatar_url: u.avatar_url,
			// Only show partial phone for privacy
			phone_partial: u.phone ? `***-***-${u.phone.slice(-4)}` : null
		}));

		return json({ users });
	} catch (error) {
		console.error('API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}