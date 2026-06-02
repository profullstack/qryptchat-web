import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';

/** List webhooks for the authenticated user */
export const GET = withAuth(async (event) => {
	const { supabase, user } = event.locals;

	const { data, error } = await supabase
		.from('webhooks')
		.select('id, url, events, created_at')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('[WEBHOOKS] List error:', error.message);
		return NextResponse.json({ error: 'Failed to list webhooks' }, { status: 500 });
	}

	return NextResponse.json({ webhooks: data });
});

/** Create a new webhook */
export const POST = withAuth(async (event) => {
	const { supabase, user } = event.locals;

	let body;
	try {
		body = await request.NextResponse.json();
	} catch {
		return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { url, events } = body;

	if (!url || typeof url !== 'string') {
		return NextResponse.json({ error: 'url is required' }, { status: 400 });
	}

	try {
		new URL(url);
	} catch {
		return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
	}

	if (!Array.isArray(events) || events.length === 0) {
		return NextResponse.json({ error: 'events must be a non-empty array' }, { status: 400 });
	}

	const { data, error } = await supabase
		.from('webhooks')
		.insert({ user_id: user.id, url, events })
		.select('id, url, events, created_at')
		.single();

	if (error) {
		console.error('[WEBHOOKS] Create error:', error.message);
		return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
	}

	return NextResponse.json({ webhook: data }, { status: 201 });
});
