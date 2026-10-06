import { NextResponse } from 'next/server';
import { CliAuthError, redeemCode, refresh, serviceClient } from '@/lib/auth/cli-auth.js';

/**
 * POST /api/cli/token: the qc CLI's token endpoint.
 *   grant_type=authorization_code  { code, code_verifier, redirect_uri }
 *   grant_type=refresh_token       { refresh_token }
 * JSON or form-encoded. Unauthenticated by design: the code and the PKCE
 * verifier are the credential.
 */
export async function POST(request) {
	let body;
	try {
		const type = request.headers.get('content-type') || '';
		body = type.includes('application/x-www-form-urlencoded')
			? Object.fromEntries(new URLSearchParams(await request.text()))
			: await request.json();
	} catch {
		return NextResponse.json({ error: 'invalid_request', error_description: 'Unreadable body' }, { status: 400 });
	}
	const headers = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
	try {
		if (body?.grant_type === 'authorization_code') {
			const result = await redeemCode(serviceClient(), {
				code: body.code,
				codeVerifier: body.code_verifier,
				redirectUri: body.redirect_uri
			});
			return NextResponse.json(result, { headers });
		}
		if (body?.grant_type === 'refresh_token') {
			return NextResponse.json(await refresh(body.refresh_token), { headers });
		}
		return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400, headers });
	} catch (error) {
		if (error instanceof CliAuthError) {
			return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status, headers });
		}
		console.error('[cli/token]', error);
		return NextResponse.json({ error: 'server_error' }, { status: 500, headers });
	}
}
