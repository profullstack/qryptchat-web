import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';

/** Delete a webhook by ID */
export const DELETE = withAuth(async (event) => {
	const { supabase, user } = event.locals;
	const { id } = (await event.context?.params) || {};
	const webhookId = typeof id === 'string' ? id.trim() : '';

	if (!webhookId) {
		return NextResponse.json({ error: 'Webhook id is required' }, { status: 400 });
	}

	const { error } = await supabase
		.from('webhooks')
		.delete()
		.eq('id', webhookId)
		.eq('user_id', user.id);

	if (error) {
		console.error('[WEBHOOKS] Delete error:', error.message);
		return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
	}

	return NextResponse.json({ success: true });
});
