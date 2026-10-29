/**
 * @fileoverview Connect CoinPay to the signed-in account (Settings).
 *
 * POST with the Bearer session (qrypt keeps sessions in localStorage, so a
 * plain link could not say who is signed in). Answers the CoinPay authorize URL
 * for the page to navigate to, and sets the sealed pending cookie that names
 * this account; the callback links the CoinPay sub to it.
 */

import { NextResponse } from 'next/server';
import { authorizeUrl, pkce, randomToken, SIGN_IN_SCOPES } from '@profullstack/coinpay-onboard/oauth';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { getCoinpayConfig, getAppOrigin, getRedirectUri } from '@/lib/auth/coinpay.js';
import { COINPAY_PENDING_COOKIE, COINPAY_PENDING_PATH, COINPAY_PENDING_TTL, sealPending } from '@/lib/auth/coinpay-flow.js';

const noStore = { 'cache-control': 'no-store' };

export const POST = withAuth(async ({ request, locals }) => {
	const { issuer, clientId, clientSecret } = getCoinpayConfig();
	if (!clientId || !clientSecret) {
		return NextResponse.json({ error: 'CoinPay is not available right now.' }, { status: 503, headers: noStore });
	}
	const appOrigin = getAppOrigin(new URL(request.url).origin);
	const state = randomToken();
	const nonce = randomToken();
	const { verifier, challenge } = pkce();
	const url = authorizeUrl({
		clientId,
		redirectUri: getRedirectUri(appOrigin),
		state,
		nonce,
		challenge,
		scopes: SIGN_IN_SCOPES,
		base: issuer
	});
	const response = NextResponse.json({ url }, { headers: noStore });
	response.cookies.set(
		COINPAY_PENDING_COOKIE,
		sealPending({ state, verifier, nonce, mode: 'connect', userId: locals.user.id }, clientSecret),
		{
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: COINPAY_PENDING_PATH,
			maxAge: COINPAY_PENDING_TTL
		}
	);
	return response;
});
