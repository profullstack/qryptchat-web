import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/auth/cli-auth.js';
import { registrationOptions, relyingParty } from '@/lib/auth/passkey.js';
import { errorResponse, noStore, optionalUser, readJson } from '@/lib/auth/passkey-http.js';

/**
 * POST /api/auth/passkey/register-options
 *   signed in (Bearer):  {}                         -> add a passkey to this account
 *   signed out:          { username, displayName }  -> sign up with a passkey
 * Returns { challengeId, options } for navigator.credentials.create().
 */
export async function POST(request) {
	try {
		const body = await readJson(request);
		const rp = relyingParty(request);
		const authUserId = await optionalUser(request);
		const result = await registrationOptions(serviceClient(), {
			rp,
			authUserId,
			username: body.username,
			displayName: body.displayName,
		});
		return NextResponse.json(result, { headers: noStore });
	} catch (err) {
		return errorResponse(err, 'register-options');
	}
}
