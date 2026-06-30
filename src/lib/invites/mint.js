/**
 * @fileoverview Ed25519 invite-token minting for anonymous registration.
 *
 * Produces tokens byte-compatible with {@link ./verify.js} and the Go
 * implementation in AgentBBS (`internal/qryptinvite`):
 *
 *   token         = "qci1." + b64url(payloadJSON) + "." + b64url(sig)
 *   signing input = "qci1." + b64url(payloadJSON)
 *   sig           = Ed25519.Sign(issuerPrivKey, signing input bytes)
 *   b64url        = base64 URL-encoding, NO padding
 *   payload       = { jti, iss, tier, iat, exp, uses }
 *
 * The issuer seed is the raw 32-byte Ed25519 seed, **standard** base64.
 * Token segments use url-safe, no-pad base64.
 */

import { sign as cryptoSign, createPrivateKey, randomBytes } from 'node:crypto';

/** Fixed first segment / version prefix for qrypt.chat invites. */
const TOKEN_PREFIX = 'qci1';

/** PKCS#8 DER prefix for a raw 32-byte Ed25519 private key (seed). */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * base64url-encode (no padding) a Buffer or string.
 * @param {Buffer | string} value
 * @returns {string}
 */
function b64url(value) {
	return Buffer.from(value).toString('base64url');
}

/**
 * Build a Node Ed25519 private KeyObject from a raw 32-byte seed (base64).
 * @param {string} seedBase64 standard-base64 raw 32-byte Ed25519 seed
 * @returns {import('node:crypto').KeyObject}
 */
export function ed25519PrivateKeyFromSeed(seedBase64) {
	const seed = Buffer.from(seedBase64, 'base64');
	if (seed.length !== 32) {
		throw new Error(`expected 32-byte Ed25519 seed, got ${seed.length} bytes`);
	}
	const der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
	return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

/**
 * Generate a random `jti` — 32 hex chars (16 random bytes), matching the
 * AgentBBS / verify.js convention.
 * @returns {string}
 */
export function generateJti() {
	return randomBytes(16).toString('hex');
}

/**
 * @typedef {Object} MintOptions
 * @property {string} seed       standard-base64 raw 32-byte Ed25519 seed
 * @property {string} iss        issuer id registered in `invite_issuers`
 * @property {string} [tier]     invite tier (default 'anonymous')
 * @property {number} [ttlSeconds] seconds until expiry (default 7 days)
 * @property {number} [uses]     allowed uses (default 1)
 * @property {string} [jti]      override jti (default random)
 * @property {number} [now]      override "now" in unix seconds (testing)
 */

/**
 * Mint a signed `qci1.` invite token.
 *
 * @param {MintOptions} options
 * @returns {{ token: string, payload: import('./verify.js').InvitePayload }}
 */
export function mintInviteToken(options) {
	const {
		seed,
		iss,
		tier = 'anonymous',
		ttlSeconds = 7 * 24 * 60 * 60,
		uses = 1,
		jti = generateJti(),
		now
	} = options || {};

	if (!seed) throw new Error('issuer seed is required to mint an invite');
	if (!iss) throw new Error('issuer id (iss) is required to mint an invite');

	const iat = typeof now === 'number' ? now : Math.floor(Date.now() / 1000);
	const exp = iat + ttlSeconds;

	/** @type {import('./verify.js').InvitePayload} */
	const payload = { jti, iss, tier, iat, exp, uses };

	const payloadSeg = b64url(JSON.stringify(payload));
	const signingInput = Buffer.from(`${TOKEN_PREFIX}.${payloadSeg}`);
	const privateKey = ed25519PrivateKeyFromSeed(seed);
	const sig = cryptoSign(null, signingInput, privateKey);

	const token = `${TOKEN_PREFIX}.${payloadSeg}.${b64url(sig)}`;
	return { token, payload };
}
