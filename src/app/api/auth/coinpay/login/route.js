/**
 * @fileoverview "Log in with CoinPay" — OAuth2/OIDC authorize entrypoint.
 *
 * Generates a CSRF `state`, an OIDC `nonce` and a PKCE (S256) verifier, keeps
 * them in a short-lived, HMAC-sealed httpOnly cookie, and 302-redirects the
 * user to the CoinPay authorize URL.
 *
 * Open to ANYONE: this initiates creation of a normal "verified" account (NOT
 * the anonymous/invite-only tier). Additive only.
 */

import { NextResponse } from 'next/server';
import { authorizeUrl, pkce, randomToken, SIGN_IN_SCOPES } from '@profullstack/coinpay-onboard/oauth';
import { getCoinpayConfig, getAppOrigin, getRedirectUri } from '@/lib/auth/coinpay.js';
import { COINPAY_PENDING_COOKIE, COINPAY_PENDING_PATH, COINPAY_PENDING_TTL, sealPending } from '@/lib/auth/coinpay-flow.js';

/**
 * GET /api/auth/coinpay/login
 * Redirects to the CoinPay OAuth2 authorize endpoint.
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
	try {
		const { issuer, clientId, clientSecret } = getCoinpayConfig();
		if (!clientId || !clientSecret) {
			console.error('coinpay/login: COINPAY_OAUTH_CLIENT_ID is not configured');
			const appOrigin = getAppOrigin(new URL(request.url).origin);
			return NextResponse.redirect(`${appOrigin}/auth?error=coinpay_unavailable`);
		}

		const appOrigin = getAppOrigin(new URL(request.url).origin);
		const redirectUri = getRedirectUri(appOrigin);

		// popup=1 → callback returns a window that postMessages the session back to
		// the opener (used by the in-iframe TronBrowser embed, where a top-level
		// redirect to the OAuth provider can't render).
		const popup = new URL(request.url).searchParams.get('popup') === '1';

		const state = randomToken();
		const nonce = randomToken();
		const { verifier, challenge } = pkce();

		const response = NextResponse.redirect(
			authorizeUrl({ clientId, redirectUri, state, nonce, challenge, scopes: SIGN_IN_SCOPES, base: issuer })
		);

		// Persist state + nonce + PKCE verifier (+ popup flag) for the callback.
		response.cookies.set(COINPAY_PENDING_COOKIE, sealPending({ state, verifier, nonce, mode: 'login', popup }, clientSecret), {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: COINPAY_PENDING_PATH,
			maxAge: COINPAY_PENDING_TTL
		});

		return response;
	} catch (error) {
		console.error('coinpay/login error:', error);
		const appOrigin = getAppOrigin(new URL(request.url).origin);
		return NextResponse.redirect(`${appOrigin}/auth?error=coinpay_login_failed`);
	}
}
