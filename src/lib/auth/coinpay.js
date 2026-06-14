/**
 * @fileoverview Shared helpers for the "Log in with CoinPay" OAuth2/OIDC flow.
 *
 * CoinPay (coinpayportal.com) is an OAuth2/OIDC identity provider. These pure
 * helpers handle config resolution, PKCE/state generation, username derivation
 * and uniqueness, and the (mockable) token/userinfo HTTP exchanges. They are
 * kept side-effect free so they can be unit-tested without Next.js.
 *
 * Additive only: does NOT touch the phone/SMS or anon-invite flows.
 */

import crypto from 'node:crypto';

/** Default CoinPay OIDC issuer base URL. */
export const DEFAULT_COINPAY_ISSUER = 'https://coinpayportal.com';

/** Short-lived cookie that carries the OAuth `state` + PKCE verifier. */
export const COINPAY_STATE_COOKIE = 'coinpay_oauth_state';

/** Requested OIDC scopes. */
export const COINPAY_SCOPES = 'openid profile email';

/**
 * Resolve the CoinPay OAuth client configuration from environment variables.
 * @returns {{ issuer: string, clientId: string|undefined, clientSecret: string|undefined }}
 */
export function getCoinpayConfig() {
	const issuer = (process.env.COINPAY_OAUTH_ISSUER || DEFAULT_COINPAY_ISSUER).replace(/\/+$/, '');
	return {
		issuer,
		clientId: process.env.COINPAY_OAUTH_CLIENT_ID,
		clientSecret: process.env.COINPAY_OAUTH_CLIENT_SECRET
	};
}

/**
 * Resolve the public app origin used to build the OAuth redirect URI.
 * Prefers NEXT_PUBLIC_APP_URL, then PUBLIC_APP_URL, then the request origin.
 * @param {string} [requestOrigin] - Origin derived from the incoming request.
 * @returns {string} Origin without a trailing slash.
 */
export function getAppOrigin(requestOrigin) {
	const origin =
		process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || requestOrigin || '';
	return origin.replace(/\/+$/, '');
}

/**
 * Build the absolute redirect URI that CoinPay must redirect back to.
 * @param {string} appOrigin
 * @returns {string}
 */
export function getRedirectUri(appOrigin) {
	return `${appOrigin}/api/auth/coinpay/callback`;
}

/** Base64url-encode a Buffer (no padding). */
function base64url(buf) {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a random opaque `state` value (CSRF protection).
 * @returns {string}
 */
export function generateState() {
	return base64url(crypto.randomBytes(32));
}

/**
 * Generate a PKCE code_verifier and its S256 code_challenge.
 * @returns {{ codeVerifier: string, codeChallenge: string }}
 */
export function generatePkcePair() {
	const codeVerifier = base64url(crypto.randomBytes(32));
	const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
	return { codeVerifier, codeChallenge };
}

/**
 * Constant-time-ish comparison of the returned `state` against the stored value.
 * @param {string|null|undefined} received - State from the callback query.
 * @param {string|null|undefined} expected - State previously stored in the cookie.
 * @returns {boolean} true only if both are present and equal.
 */
export function validateState(received, expected) {
	if (!received || !expected || typeof received !== 'string' || typeof expected !== 'string') {
		return false;
	}
	if (received.length !== expected.length) {
		return false;
	}
	return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/**
 * Build the full CoinPay authorize URL.
 * @param {object} params
 * @param {string} params.issuer
 * @param {string} params.clientId
 * @param {string} params.redirectUri
 * @param {string} params.state
 * @param {string} [params.codeChallenge] - Optional PKCE S256 challenge.
 * @returns {string}
 */
export function buildAuthorizeUrl({ issuer, clientId, redirectUri, state, codeChallenge }) {
	const url = new URL(`${issuer}/api/oauth/authorize`);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', clientId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('scope', COINPAY_SCOPES);
	url.searchParams.set('state', state);
	if (codeChallenge) {
		url.searchParams.set('code_challenge', codeChallenge);
		url.searchParams.set('code_challenge_method', 'S256');
	}
	return url.toString();
}

/**
 * Sanitize an arbitrary string into a username-safe base (lowercase a-z0-9_),
 * trimmed to a reasonable length. Returns '' when nothing usable remains.
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeUsernameBase(raw) {
	if (!raw || typeof raw !== 'string') {
		return '';
	}
	const cleaned = raw
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 24);
	return cleaned;
}

/**
 * Derive a candidate username base from CoinPay claims.
 * Prefers `name`, falls back to the email local-part, then to "user".
 * @param {{ name?: string, email?: string }} claims
 * @returns {string} A non-empty username base.
 */
export function deriveUsernameBase({ name, email } = {}) {
	const fromName = sanitizeUsernameBase(name);
	if (fromName) {
		return fromName;
	}
	const localPart = typeof email === 'string' ? email.split('@')[0] : '';
	const fromEmail = sanitizeUsernameBase(localPart);
	if (fromEmail) {
		return fromEmail;
	}
	return 'user';
}

/** Short random suffix used to resolve username collisions. */
function randomSuffix() {
	return base64url(crypto.randomBytes(4)).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || '1';
}

/**
 * Derive a username that is unique according to the provided availability check.
 * Tries the base first, then appends a short random suffix, retrying on
 * collision up to `maxAttempts` times.
 *
 * @param {{ name?: string, email?: string }} claims - CoinPay userinfo claims.
 * @param {(candidate: string) => (boolean|Promise<boolean>)} isTaken - Returns
 *   true when the candidate username already exists (case-insensitive).
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=10]
 * @returns {Promise<string>} A username believed to be unique.
 * @throws {Error} If a unique username cannot be found within maxAttempts.
 */
export async function deriveUniqueUsername(claims, isTaken, { maxAttempts = 10 } = {}) {
	const base = deriveUsernameBase(claims);
	if (!(await isTaken(base))) {
		return base;
	}
	for (let i = 0; i < maxAttempts; i++) {
		// Keep within the 24-char base budget plus a separator + suffix.
		const candidate = `${base.slice(0, 20)}_${randomSuffix()}`;
		// eslint-disable-next-line no-await-in-loop
		if (!(await isTaken(candidate))) {
			return candidate;
		}
	}
	throw new Error('Could not derive a unique username');
}

/**
 * Exchange an authorization code for tokens at the CoinPay token endpoint.
 * @param {object} params
 * @param {string} params.issuer
 * @param {string} params.code
 * @param {string} params.redirectUri
 * @param {string} params.clientId
 * @param {string} params.clientSecret
 * @param {string} [params.codeVerifier] - PKCE verifier when PKCE was used.
 * @param {typeof fetch} [fetchImpl=fetch] - Injectable fetch (for tests).
 * @returns {Promise<{ access_token: string, refresh_token?: string, id_token?: string, token_type?: string, expires_in?: number }>}
 */
export async function exchangeCodeForToken(
	{ issuer, code, redirectUri, clientId, clientSecret, codeVerifier },
	fetchImpl = fetch
) {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		redirect_uri: redirectUri,
		client_id: clientId,
		client_secret: clientSecret
	});
	if (codeVerifier) {
		body.set('code_verifier', codeVerifier);
	}

	const res = await fetchImpl(`${issuer}/api/oauth/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: body.toString()
	});

	if (!res.ok) {
		throw new Error(`CoinPay token exchange failed (${res.status})`);
	}
	const data = await res.json();
	if (!data || !data.access_token) {
		throw new Error('CoinPay token response missing access_token');
	}
	return data;
}

/**
 * Fetch OIDC userinfo claims using a bearer access token.
 * @param {object} params
 * @param {string} params.issuer
 * @param {string} params.accessToken
 * @param {typeof fetch} [fetchImpl=fetch] - Injectable fetch (for tests).
 * @returns {Promise<{ sub: string, email?: string, email_verified?: boolean, name?: string }>}
 */
export async function fetchUserinfo({ issuer, accessToken }, fetchImpl = fetch) {
	const res = await fetchImpl(`${issuer}/api/oauth/userinfo`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json'
		}
	});

	if (!res.ok) {
		throw new Error(`CoinPay userinfo request failed (${res.status})`);
	}
	const claims = await res.json();
	if (!claims || (!claims.sub && !claims.email)) {
		throw new Error('CoinPay userinfo missing sub/email');
	}
	return claims;
}
