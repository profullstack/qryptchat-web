import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/auth/cli-auth.js';
import { authenticationOptions, relyingParty } from '@/lib/auth/passkey.js';
import { errorResponse, noStore } from '@/lib/auth/passkey-http.js';

/**
 * POST /api/auth/passkey/login-options -> { challengeId, options }
 * Discoverable sign-in: no username is asked for, so nothing here reveals
 * whether an account exists.
 */
export async function POST(request) {
	try {
		return NextResponse.json(await authenticationOptions(serviceClient(), { rp: relyingParty(request) }), { headers: noStore });
	} catch (err) {
		return errorResponse(err, 'login-options');
	}
}
