import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const { data: { session }, error } = await supabase.auth.getSession();
		
		if (error) {
			return json({ error: error.message }, { status: 401 });
		}
		
		return json({ session });
	} catch (error) {
		console.error('Auth session API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}