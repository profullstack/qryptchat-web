/**
 * @fileoverview "Log in with CoinPay" — OAuth2/OIDC authorize entrypoint.
 *
 * Delegates to the shared `createCoinPayLoginHandler` from
 * `@profullstack/stack/coinpay`: generates a CSRF `state` + PKCE (S256)
 * verifier, stores them in a short-lived httpOnly cookie, and 302-redirects
 * the user to the CoinPay authorize URL.
 *
 * Open to ANYONE: this initiates creation of a normal "verified" account (NOT
 * the anonymous/invite-only tier). Additive only.
 */

import { NextResponse } from 'next/server';
import { createCoinPayLoginHandler } from '@profullstack/stack/coinpay';
import { getCoinpayConfig, getAppOrigin, getRedirectUri } from '@/lib/auth/coinpay.js';

/**
 * GET /api/auth/coinpay/login
 * Redirects to the CoinPay OAuth2 authorize endpoint.
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
	const appOrigin = getAppOrigin(new URL(request.url).origin);
	try {
		const { issuer, clientId } = getCoinpayConfig();
		if (!clientId) {
			console.error('coinpay/login: COINPAY_OAUTH_CLIENT_ID is not configured');
			return NextResponse.redirect(`${appOrigin}/auth?error=coinpay_unavailable`);
		}

		return await createCoinPayLoginHandler({
			clientId,
			issuer,
			redirectUri: getRedirectUri(appOrigin),
			// popup=1 → callback returns a window that postMessages the session back
			// to the opener (used by the in-iframe TronBrowser embed, where a
			// top-level redirect to the OAuth provider can't render).
			extraState: (req) => ({ popup: new URL(req.url).searchParams.get('popup') === '1' })
		})(request);
	} catch (error) {
		console.error('coinpay/login error:', error);
		return NextResponse.redirect(`${appOrigin}/auth?error=coinpay_login_failed`);
	}
}
