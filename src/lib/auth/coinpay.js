/**
 * @fileoverview QryptChat-specific helpers for the "Log in with CoinPay"
 * OAuth2/OIDC flow: config resolution and username derivation/uniqueness.
 *
 * The generic OAuth pieces (state/PKCE generation, state validation,
 * authorize-URL building, token/userinfo exchange, COINPAY_STATE_COOKIE)
 * come from `@profullstack/stack/coinpay` — import them from there.
 *
 * Kept side-effect free so they can be unit-tested without Next.js.
 * Additive only: does NOT touch the phone/SMS or anon-invite flows.
 */

import crypto from 'node:crypto';
import { COINPAY_DEFAULT_ISSUER } from '@profullstack/stack/coinpay';

/**
 * Resolve the CoinPay OAuth client configuration from environment variables.
 * @returns {{ issuer: string, clientId: string|undefined, clientSecret: string|undefined }}
 */
export function getCoinpayConfig() {
	const issuer = (process.env.COINPAY_OAUTH_ISSUER || COINPAY_DEFAULT_ISSUER).replace(/\/+$/, '');
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
