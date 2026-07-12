/**
 * @fileoverview Ed25519 invite-token verification for anonymous registration.
 *
 * Token format (single fixed algorithm — no alg field, no JWT):
 *   token         = "qci1." + b64url(payloadJSON) + "." + b64url(sig)
 *   signing input = "qci1." + b64url(payloadJSON)
 *   sig           = Ed25519.Sign(issuerPrivKey, signing input bytes)
 *   b64url        = base64 URL-encoding, NO padding
 *
 * This module performs NO database access. Issuer public-key lookup is
 * injected via the `getIssuerPublicKey` async function.
 */

import { verify as cryptoVerify, createPublicKey } from 'node:crypto';

/** Fixed first segment / version prefix for qrypt.chat invites. */
const TOKEN_PREFIX = 'qci1';

/** SPKI DER prefix for a raw 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Typed error thrown for any invalid / expired / malformed invite token.
 * @property {string} code machine-readable reason
 */
export class InviteVerificationError extends Error {
	/**
	 * @param {string} code
	 * @param {string} message
	 */
	constructor(code, message) {
		super(message);
		this.name = 'InviteVerificationError';
		this.code = code;
	}
}

/**
 * Decode a base64url (no padding) string to a Buffer.
 * @param {string} value
 * @returns {Buffer}
 */
function b64urlDecode(value) {
	// Node's 'base64url' decoder tolerates missing padding.
	return Buffer.from(value, 'base64url');
}

/**
 * @param {number} value
 * @returns {boolean}
 */
function isUnixSecond(value) {
	return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Wrap a raw 32-byte Ed25519 public key (base64) into a Node KeyObject by
 * prepending the SPKI DER header and importing as DER/SPKI.
 * @param {string} base64 base64-encoded raw 32-byte public key
 * @returns {import('node:crypto').KeyObject}
 */
export function ed25519PublicKeyFromRaw(base64) {
	const raw = Buffer.from(base64, 'base64');
	if (raw.length !== 32) {
		throw new InviteVerificationError(
			'bad_issuer_key',
			`expected 32-byte Ed25519 public key, got ${raw.length} bytes`
		);
	}
	const der = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
	return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

/**
 * @typedef {Object} InvitePayload
 * @property {string} jti  32-hex-char random (16 bytes)
 * @property {string} iss  issuer id, e.g. "agentbbs"
 * @property {string} tier invite tier, e.g. "anonymous"
 * @property {number} iat  issued-at (unix seconds)
 * @property {number} exp  expiry (unix seconds)
 * @property {number} uses allowed uses (v1: 1)
 */

/**
 * Parse, verify the Ed25519 signature of, and validate an invite token.
 *
 * Performs no DB access: `getIssuerPublicKey` is an injected async function
 * that, given the payload's `iss`, returns the issuer's base64 raw 32-byte
 * Ed25519 public key — or a falsy value if the issuer is unknown/disabled.
 *
 * @param {string} token the invite token string
 * @param {(iss: string) => Promise<string | null | undefined>} getIssuerPublicKey
 * @returns {Promise<InvitePayload>} the decoded + validated payload
 * @throws {InviteVerificationError} on any validation failure
 */
export async function verifyInviteToken(token, getIssuerPublicKey) {
	if (typeof token !== 'string' || token.length === 0) {
		throw new InviteVerificationError('bad_format', 'invite token is required');
	}

	const segments = token.split('.');
	if (segments.length !== 3) {
		throw new InviteVerificationError('bad_format', 'invite token must have 3 segments');
	}

	const [version, payloadSeg, sigSeg] = segments;
	if (version !== TOKEN_PREFIX || !payloadSeg || !sigSeg) {
		throw new InviteVerificationError('bad_format', 'invalid invite token prefix or segments');
	}

	/** @type {InvitePayload} */
	let payload;
	try {
		payload = JSON.parse(b64urlDecode(payloadSeg).toString('utf8'));
	} catch {
		throw new InviteVerificationError('bad_format', 'invite payload is not valid JSON');
	}

	if (!payload || typeof payload.iss !== 'string' || !payload.iss) {
		throw new InviteVerificationError('bad_format', 'invite payload missing issuer');
	}
	if (typeof payload.jti !== 'string' || !payload.jti) {
		throw new InviteVerificationError('bad_format', 'invite payload missing jti');
	}
	if (!/^[0-9a-f]{32}$/u.test(payload.jti)) {
		throw new InviteVerificationError('bad_format', 'invite payload has invalid jti');
	}
	if (typeof payload.tier !== 'string' || !payload.tier) {
		throw new InviteVerificationError('bad_format', 'invite payload missing tier');
	}
	if (!isUnixSecond(payload.iat)) {
		throw new InviteVerificationError('bad_format', 'invite payload missing iat');
	}
	if (!isUnixSecond(payload.exp)) {
		throw new InviteVerificationError('bad_format', 'invite payload missing exp');
	}
	if (payload.exp <= payload.iat) {
		throw new InviteVerificationError('bad_format', 'invite payload expiry must be after iat');
	}
	if (!Number.isSafeInteger(payload.uses) || payload.uses !== 1) {
		throw new InviteVerificationError('bad_format', 'invite payload uses must be 1');
	}

	const issuerPublicKey = await getIssuerPublicKey(payload.iss);
	if (!issuerPublicKey) {
		throw new InviteVerificationError('unknown_issuer', `unknown or disabled issuer: ${payload.iss}`);
	}

	const keyObject = ed25519PublicKeyFromRaw(issuerPublicKey);
	const signingInput = Buffer.from(`${TOKEN_PREFIX}.${payloadSeg}`);

	let signature;
	try {
		signature = b64urlDecode(sigSeg);
	} catch {
		throw new InviteVerificationError('bad_signature', 'invite signature is not valid base64url');
	}

	// Ed25519 uses no separate hash algorithm — pass null as the algorithm.
	const ok = cryptoVerify(null, signingInput, keyObject, signature);
	if (!ok) {
		throw new InviteVerificationError('bad_signature', 'invite signature verification failed');
	}

	const nowSeconds = Date.now() / 1000;
	if (nowSeconds > payload.exp) {
		throw new InviteVerificationError('expired', 'invite token has expired');
	}

	return payload;
}
