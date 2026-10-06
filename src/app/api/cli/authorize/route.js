import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { assertAccountKey, CliAuthError, issueCode, serviceClient } from '@/lib/auth/cli-auth.js';

/**
 * POST /api/cli/authorize: the signed-in web app approves a `qc login`.
 * Body: { code_challenge, code_challenge_method: "S256", redirect_uri, client_name, key_blob, public_key }
 * Returns { code }. See src/lib/auth/cli-auth.js for the whole flow.
 */
export const POST = withAuth(async ({ request, locals }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: 'invalid_request', error_description: 'Invalid JSON body' }, { status: 400 });
	}
	if (body?.code_challenge_method !== 'S256') {
		return NextResponse.json({ error: 'invalid_request', error_description: 'Only S256 is supported' }, { status: 400 });
	}
	try {
		await assertAccountKey(serviceClient(), locals.user.id, body.public_key);
		const code = await issueCode(serviceClient(), {
			authUserId: locals.user.id,
			codeChallenge: body.code_challenge,
			redirectUri: body.redirect_uri,
			clientName: body.client_name,
			keyBlob: body.key_blob
		});
		return NextResponse.json({ code }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		if (error instanceof CliAuthError) {
			return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
		}
		console.error('[cli/authorize]', error);
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
});
