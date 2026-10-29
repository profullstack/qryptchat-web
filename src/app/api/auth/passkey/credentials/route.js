import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { serviceClient } from '@/lib/auth/cli-auth.js';
import { noStore } from '@/lib/auth/passkey-http.js';

/** GET: the signed-in account's passkeys. DELETE ?id=<uuid>: remove one of them. */
export const GET = withAuth(async ({ locals }) => {
	const { data, error } = await serviceClient()
		.from('webauthn_credentials')
		.select('id, name, device_type, backed_up, created_at, last_used_at')
		.eq('auth_user_id', locals.user.id)
		.order('created_at', { ascending: true });
	if (error) return NextResponse.json({ error: 'Could not load passkeys' }, { status: 500, headers: noStore });
	return NextResponse.json({ passkeys: data || [] }, { headers: noStore });
});

export const DELETE = withAuth(async ({ request, locals }) => {
	const id = new URL(request.url).searchParams.get('id');
	if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers: noStore });
	// The auth_user_id filter is the authorization: nobody removes another account's passkey.
	const { data, error } = await serviceClient()
		.from('webauthn_credentials')
		.delete()
		.eq('id', id)
		.eq('auth_user_id', locals.user.id)
		.select('id');
	if (error) return NextResponse.json({ error: 'Could not remove the passkey' }, { status: 500, headers: noStore });
	if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore });
	return NextResponse.json({ removed: true }, { headers: noStore });
});
