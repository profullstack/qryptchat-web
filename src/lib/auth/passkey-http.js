/** Shared plumbing for the /api/auth/passkey/* routes. */
import { NextResponse } from 'next/server';
import { authenticateRequest, getBearerToken } from '@/lib/api/middleware/auth.js';
import { PasskeyError } from './passkey.js';

export const noStore = { 'Cache-Control': 'no-store' };

export async function readJson(request) {
	try {
		return (await request.json()) ?? {};
	} catch {
		return {};
	}
}

/** The signed-in auth user id when a Bearer token is sent, else null. A bad token is an error, not a sign-up. */
export async function optionalUser(request) {
	if (!getBearerToken(request.headers.get('authorization'))) return null;
	const auth = await authenticateRequest(request);
	if (!auth.success) throw new PasskeyError('Your session has ended. Sign in again.', 401);
	return auth.user.id;
}

export function errorResponse(err, label) {
	if (err instanceof PasskeyError || err?.status) {
		return NextResponse.json({ error: err.message }, { status: err.status || 400, headers: noStore });
	}
	console.error(`[passkey ${label}]`, err?.message || err);
	return NextResponse.json({ error: 'Something went wrong with the passkey. Try again.' }, { status: 500, headers: noStore });
}
