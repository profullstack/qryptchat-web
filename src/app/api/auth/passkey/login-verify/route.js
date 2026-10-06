import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/auth/cli-auth.js';
import { authenticationVerify } from '@/lib/auth/passkey.js';
import { signedIn } from '@/lib/auth/passkey-account.js';
import { errorResponse, noStore, readJson } from '@/lib/auth/passkey-http.js';

/** POST /api/auth/passkey/login-verify { challengeId, response } -> { session, user } */
export async function POST(request) {
	try {
		const body = await readJson(request);
		const service = serviceClient();
		const authUserId = await authenticationVerify(service, { challengeId: body.challengeId, response: body.response });
		return NextResponse.json(await signedIn(service, authUserId), { headers: noStore });
	} catch (err) {
		return errorResponse(err, 'login-verify');
	}
}
