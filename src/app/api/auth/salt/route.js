import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';

function getServiceRoleClient() {
	return createServiceRoleClient();
}


export async function GET(request) {
	const url = new URL(request.url);
	try {
		const phone = url.searchParams.get('phone');
		if (!phone) {
			return NextResponse.json({ error: 'Missing phone parameter' }, { status: 400 });
		}

		const { data, error } = await getServiceRoleClient()
			.from('users')
			.select('salt')
			.eq('phone_number', phone)
			.single();

		if (error) {
			return NextResponse.json({ salt: null });
		}

		return NextResponse.json({ salt: data?.salt ?? null });
	} catch (error) {
		console.error('Salt GET error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}


export async function POST(request) {
	try {
		const { phone, salt } = await request.json();

		if (!phone || !salt) {
			return NextResponse.json({ error: 'Missing phone or salt' }, { status: 400 });
		}

		// Only store salt if user doesn't already have one
		const { data: existing } = await getServiceRoleClient()
			.from('users')
			.select('salt')
			.eq('phone_number', phone)
			.single();

		if (existing?.salt) {
			return NextResponse.json({ salt: existing.salt, existing: true });
		}

		const { error } = await getServiceRoleClient()
			.from('users')
			.update({ salt })
			.eq('phone_number', phone);

		if (error) {
			console.error('Salt POST update error:', error);
			return NextResponse.json({ error: 'Failed to store salt' }, { status: 500 });
		}

		return NextResponse.json({ salt, existing: false });
	} catch (error) {
		console.error('Salt POST error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
