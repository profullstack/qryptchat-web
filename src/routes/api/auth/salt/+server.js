import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';

function getServiceRoleClient() {
	return createServiceRoleClient();
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	try {
		const phone = url.searchParams.get('phone');
		if (!phone) {
			return json({ error: 'Missing phone parameter' }, { status: 400 });
		}

		const { data, error } = await getServiceRoleClient()
			.from('users')
			.select('salt')
			.eq('phone_number', phone)
			.single();

		if (error) {
			return json({ salt: null });
		}

		return json({ salt: data?.salt ?? null });
	} catch (error) {
		console.error('Salt GET error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	try {
		const { phone, salt } = await request.json();

		if (!phone || !salt) {
			return json({ error: 'Missing phone or salt' }, { status: 400 });
		}

		// Only store salt if user doesn't already have one
		const { data: existing } = await getServiceRoleClient()
			.from('users')
			.select('salt')
			.eq('phone_number', phone)
			.single();

		if (existing?.salt) {
			return json({ salt: existing.salt, existing: true });
		}

		const { error } = await getServiceRoleClient()
			.from('users')
			.update({ salt })
			.eq('phone_number', phone);

		if (error) {
			console.error('Salt POST update error:', error);
			return json({ error: 'Failed to store salt' }, { status: 500 });
		}

		return json({ salt, existing: false });
	} catch (error) {
		console.error('Salt POST error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
