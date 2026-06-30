/**
 * @fileoverview Tests for Ed25519 invite-token minting.
 * Proves minted tokens round-trip through the deployed verifier.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mintInviteToken, ed25519PrivateKeyFromSeed, generateJti } from './mint.js';
import { verifyInviteToken, InviteVerificationError } from './verify.js';

/**
 * Generate a matched (seedBase64, rawPublicKeyBase64) Ed25519 pair the way
 * the web issuer keypair is generated.
 * @returns {{ seedB64: string, pubB64: string }}
 */
function generateIssuerPair() {
	const { publicKey, privateKey } = generateKeyPairSync('ed25519');
	const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
	const rawSeed = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
	return {
		seedB64: Buffer.from(rawSeed).toString('base64'),
		pubB64: Buffer.from(rawPub).toString('base64')
	};
}

describe('mintInviteToken', () => {
	let seedB64;
	let pubB64;
	/** @type {(iss: string) => Promise<string | null>} */
	let getIssuerPublicKey;

	beforeAll(() => {
		({ seedB64, pubB64 } = generateIssuerPair());
		getIssuerPublicKey = async (iss) => (iss === 'qryptchat-web' ? pubB64 : null);
	});

	it('mints a token that the verifier accepts', async () => {
		const { token, payload } = mintInviteToken({ seed: seedB64, iss: 'qryptchat-web' });
		expect(token.startsWith('qci1.')).toBe(true);
		const verified = await verifyInviteToken(token, getIssuerPublicKey);
		expect(verified.jti).toBe(payload.jti);
		expect(verified.iss).toBe('qryptchat-web');
		expect(verified.tier).toBe('anonymous');
		expect(verified.uses).toBe(1);
	});

	it('defaults to a 7-day expiry and single use', () => {
		const now = 1_000_000;
		const { payload } = mintInviteToken({ seed: seedB64, iss: 'qryptchat-web', now });
		expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
		expect(payload.iat).toBe(now);
		expect(payload.uses).toBe(1);
	});

	it('honors custom ttl, uses, and jti', async () => {
		const jti = generateJti();
		const { token, payload } = mintInviteToken({
			seed: seedB64,
			iss: 'qryptchat-web',
			ttlSeconds: 3600,
			uses: 1,
			jti
		});
		expect(payload.jti).toBe(jti);
		expect(payload.exp - payload.iat).toBe(3600);
		await expect(verifyInviteToken(token, getIssuerPublicKey)).resolves.toBeTruthy();
	});

	it('produces an expired token that the verifier rejects', async () => {
		const { token } = mintInviteToken({
			seed: seedB64,
			iss: 'qryptchat-web',
			ttlSeconds: -10
		});
		await expect(verifyInviteToken(token, getIssuerPublicKey)).rejects.toBeInstanceOf(
			InviteVerificationError
		);
	});

	it('rejects an unknown issuer at verify time', async () => {
		const { token } = mintInviteToken({ seed: seedB64, iss: 'not-registered' });
		await expect(verifyInviteToken(token, getIssuerPublicKey)).rejects.toMatchObject({
			code: 'unknown_issuer'
		});
	});

	it('rejects a malformed seed', () => {
		expect(() => ed25519PrivateKeyFromSeed('tooshort')).toThrow();
		expect(() => mintInviteToken({ iss: 'qryptchat-web' })).toThrow(/seed is required/);
		expect(() => mintInviteToken({ seed: seedB64 })).toThrow(/issuer id/);
	});
});
