import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const { data: { user }, error } = await supabase.auth.getUser();
		
		if (error) {
			return json({ error: error.message }, { status: 401 });
		}
		
		return json({ user });
	} catch (error) {
		console.error('Auth user API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}