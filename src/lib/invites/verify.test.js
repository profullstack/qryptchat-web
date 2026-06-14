/**
 * @fileoverview Tests for Ed25519 invite-token verification.
 * Mints tokens in-test with a generated keypair to exercise the verifier.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { verifyInviteToken, ed25519PublicKeyFromRaw, InviteVerificationError } from './verify.js';

const TOKEN_PREFIX = 'qci1';

/**
 * base64url-encode (no padding) a Buffer/string.
 * @param {Buffer | string} value
 * @returns {string}
 */
function b64url(value) {
	return Buffer.from(value).toString('base64url');
}

/**
 * Extract the raw 32-byte public key (base64) from an Ed25519 KeyObject.
 * @param {import('node:crypto').KeyObject} publicKey
 * @returns {string}
 */
function rawPublicKeyBase64(publicKey) {
	const der = publicKey.export({ format: 'der', type: 'spki' });
	// SPKI DER prefix for Ed25519 is 12 bytes; the trailing 32 bytes are raw.
	return der.subarray(der.length - 32).toString('base64');
}

/**
 * Mint a signed invite token.
 * @param {import('node:crypto').KeyObject} privateKey
 * @param {object} payload
 * @returns {string}
 */
function mintToken(privateKey, payload) {
	const payloadSeg = b64url(JSON.stringify(payload));
	const signingInput = Buffer.from(`${TOKEN_PREFIX}.${payloadSeg}`);
	const sig = cryptoSign(null, signingInput, privateKey);
	return `${TOKEN_PREFIX}.${payloadSeg}.${b64url(sig)}`;
}

describe('verifyInviteToken', () => {
	/** @type {import('node:crypto').KeyObject} */
	let publicKey;
	/** @type {import('node:crypto').KeyObject} */
	let privateKey;
	let issuerPubB64;
	/** @type {(iss: string) => Promise<string | null>} */
	let getIssuerPublicKey;

	const nowSec = () => Math.floor(Date.now() / 1000);

	function basePayload(overrides = {}) {
		return {
			jti: 'a'.repeat(32),
			iss: 'agentbbs',
			tier: 'anonymous',
			iat: nowSec() - 10,
			exp: nowSec() + 3600,
			uses: 1,
			...overrides,
		};
	}

	beforeAll(() => {
		({ publicKey, privateKey } = generateKeyPairSync('ed25519'));
		issuerPubB64 = rawPublicKeyBase64(publicKey);
		getIssuerPublicKey = async (iss) => (iss === 'agentbbs' ? issuerPubB64 : null);
	});

	it('accepts a valid token and returns the payload', async () => {
		const payload = basePayload();
		const token = mintToken(privateKey, payload);
		const result = await verifyInviteToken(token, getIssuerPublicKey);
		expect(result.jti).toBe(payload.jti);
		expect(result.iss).toBe('agentbbs');
		expect(result.tier).toBe('anonymous');
	});

	it('rejects a tampered payload', async () => {
		const token = mintToken(privateKey, basePayload());
		const [v, , s] = token.split('.');
		const forged = b64url(JSON.stringify(basePayload({ jti: 'b'.repeat(32) })));
		const tampered = `${v}.${forged}.${s}`;
		await expect(verifyInviteToken(tampered, getIssuerPublicKey)).rejects.toMatchObject({
			code: 'bad_signature',
		});
	});

	it('rejects an expired token', async () => {
		const token = mintToken(privateKey, basePayload({ exp: nowSec() - 60 }));
		await expect(verifyInviteToken(token, getIssuerPublicKey)).rejects.toMatchObject({
			code: 'expired',
		});
	});

	it('rejects a token signed by the wrong issuer key', async () => {
		const { privateKey: otherPriv } = generateKeyPairSync('ed25519');
		const token = mintToken(otherPriv, basePayload());
		await expect(verifyInviteToken(token, getIssuerPublicKey)).rejects.toMatchObject({
			code: 'bad_signature',
		});
	});

	it('rejects an unknown issuer', async () => {
		const token = mintToken(privateKey, basePayload({ iss: 'nope' }));
		await expect(verifyInviteToken(token, getIssuerPublicKey)).rejects.toMatchObject({
			code: 'unknown_issuer',
		});
	});

	it('rejects a malformed token (wrong segment count)', async () => {
		await expect(verifyInviteToken('qci1.onlyonesegment', getIssuerPublicKey)).rejects.toBeInstanceOf(
			InviteVerificationError
		);
		await expect(verifyInviteToken('qci1.onlyonesegment', getIssuerPublicKey)).rejects.toMatchObject({
			code: 'bad_format',
		});
	});

	it('rejects a malformed token (wrong prefix)', async () => {
		const token = mintToken(privateKey, basePayload());
		const wrongPrefix = token.replace(/^qci1\./, 'qciX.');
		await expect(verifyInviteToken(wrongPrefix, getIssuerPublicKey)).rejects.toMatchObject({
			code: 'bad_format',
		});
	});

	it('rejects empty/non-string token', async () => {
		await expect(verifyInviteToken('', getIssuerPublicKey)).rejects.toMatchObject({ code: 'bad_format' });
		await expect(verifyInviteToken(null, getIssuerPublicKey)).rejects.toMatchObject({ code: 'bad_format' });
	});
});

describe('ed25519PublicKeyFromRaw', () => {
	it('round-trips a generated raw public key', () => {
		const { publicKey } = generateKeyPairSync('ed25519');
		const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
		const keyObject = ed25519PublicKeyFromRaw(raw);
		expect(keyObject.asymmetricKeyType).toBe('ed25519');
	});

	it('throws on a wrong-length key', () => {
		expect(() => ed25519PublicKeyFromRaw(Buffer.from('short').toString('base64'))).toThrow(
			InviteVerificationError
		);
	});
});
