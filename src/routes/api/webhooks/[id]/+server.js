import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';

/** Delete a webhook by ID */
export const DELETE = withAuth(async (event) => {
	const { supabase, user } = event.locals;
	const { id } = event.params;

	const { error } = await supabase
		.from('webhooks')
		.delete()
		.eq('id', id)
		.eq('user_id', user.id);

	if (error) {
		console.error('[WEBHOOKS] Delete error:', error.message);
		return json({ error: 'Failed to delete webhook' }, { status: 500 });
	}

	return json({ success: true });
});
