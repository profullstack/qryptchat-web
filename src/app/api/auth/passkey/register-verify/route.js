import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/auth/cli-auth.js';
import { registrationVerify } from '@/lib/auth/passkey.js';
import { provisionPasskeyAccount, signedIn } from '@/lib/auth/passkey-account.js';
import { errorResponse, noStore, readJson } from '@/lib/auth/passkey-http.js';

/**
 * POST /api/auth/passkey/register-verify  { challengeId, response, name? }
 * Sign-up returns { session, user, created: true }; adding a passkey returns { added: true }.
 * Who the passkey belongs to comes from the challenge, never from this body.
 */
export async function POST(request) {
	try {
		const body = await readJson(request);
		const service = serviceClient();
		const { authUserId, created } = await registrationVerify(service, {
			challengeId: body.challengeId,
			response: body.response,
			name: body.name,
			provision: (profile) => provisionPasskeyAccount(service, profile),
		});
		if (!created) return NextResponse.json({ added: true }, { headers: noStore });
		return NextResponse.json({ ...(await signedIn(service, authUserId)), created: true }, { headers: noStore });
	} catch (err) {
		return errorResponse(err, 'register-verify');
	}
}
