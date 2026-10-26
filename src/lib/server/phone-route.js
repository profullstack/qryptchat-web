// Shared bits of the /api/phone routes.
import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { PhoneError, supabaseStore } from './phone.js';
import { TelnyxError, phoneConfigured, telnyxClient, telnyxConfig } from './telnyx-voice.js';

export function phoneContext() {
	if (!phoneConfigured()) throw new PhoneError('Phone calls are not set up on this server.', 503);
	const config = telnyxConfig();
	const db = getServiceRoleClient();
	return { db, store: supabaseStore(db), telnyx: telnyxClient(config), config };
}

/** The signed-in person's users row (id, account_type). */
export async function phoneUser(db, authUserId) {
	const { data } = await db.from('users').select('id, username, account_type').eq('auth_user_id', authUserId).single();
	if (!data) throw new PhoneError('User not found', 404);
	return data;
}

export function phoneError(error, tag) {
	if (error instanceof PhoneError) return NextResponse.json({ error: error.message }, { status: error.status });
	if (error instanceof TelnyxError) {
		console.error(`[phone/${tag}] telnyx`, error.status, error.code, error.message);
		return NextResponse.json({ error: 'The phone service refused the request.' }, { status: 502 });
	}
	console.error(`[phone/${tag}]`, error?.message);
	return NextResponse.json({ error: 'Something went wrong with the call.' }, { status: 500 });
}
