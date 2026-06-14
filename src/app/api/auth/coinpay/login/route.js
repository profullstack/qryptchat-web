/**
 * @fileoverview "Log in with CoinPay" — OAuth2/OIDC authorize entrypoint.
 *
 * Generates a CSRF `state` + PKCE (S256) verifier, stores them in a short-lived
 * httpOnly cookie, and 302-redirects the user to the CoinPay authorize URL.
 *
 * Open to ANYONE: this initiates creation of a normal "verified" account (NOT
 * the anonymous/invite-only tier). Additive only.
 */

import { NextResponse } from 'next/server';
import {
	getCoinpayConfig,
	getAppOrigin,
	getRedirectUri,
	generateState,
	generatePkcePair,
	buildAuthorizeUrl,
	COINPAY_STATE_COOKIE
} from '@/lib/auth/coinpay.js';

/** State cookie lifetime in seconds (short — only needs to survive the round-trip). */
const STATE_COOKIE_MAX_AGE = 600;

/**
 * GET /api/auth/coinpay/login
 * Redirects to the CoinPay OAuth2 authorize endpoint.
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
	try {
		const { issuer, clientId } = getCoinpayConfig();
		if (!clientId) {
			console.error('coinpay/login: COINPAY_OAUTH_CLIENT_ID is not configured');
			const appOrigin = getAppOrigin(new URL(request.url).origin);
			return NextResponse.redirect(`${appOrigin}/auth?error=coinpay_unavailable`);
		}

		const appOrigin = getAppOrigin(new URL(request.url).origin);
		const redirectUri = getRedirectUri(appOrigin);

		const state = generateState();
		const { codeVerifier, codeChallenge } = generatePkcePair();

		const authorizeUrl = buildAuthorizeUrl({
			issuer,
			clientId,
			redirectUri,
			state,
			codeChallenge
		});

		const response = NextResponse.redirect(authorizeUrl);

		// Persist state + PKCE verifier for the callback to validate/consume.
		response.cookies.set(COINPAY_STATE_COOKIE, JSON.stringify({ state, codeVerifier }), {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/',
			maxAge: STATE_COOKIE_MAX_AGE
		});

		return response;
	} catch (error) {
		console.error('coinpay/login error:', error);
		const appOrigin = getAppOrigin(new URL(request.url).origin);
		return NextResponse.redirect(`${appOrigin}/auth?error=coinpay_login_failed`);
	}
}
