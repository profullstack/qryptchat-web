import { describe, expect, it } from 'vitest';
import {
	authUserIdFromToken,
	generateRecoveryKey,
	looksLikeRecoveryKey,
	parseRecoveryKey,
	passphraseProblem,
	SEAL_PBKDF2_ITERATIONS,
	sealEnvelopeProblem,
	sealKeys,
	unsealKeys
} from './key-backup-seal.js';

const USER = '8f4b6316-0000-4000-8000-000000000001';
const PASS = 'correct horse battery staple';
const dec = (b) => new TextDecoder().decode(b);
const keys = new TextEncoder().encode(JSON.stringify({ keys1024: { publicKey: 'pk', privateKey: 'sk' } }));

async function sealed() {
	const recoveryKey = generateRecoveryKey();
	const envelope = await sealKeys(keys, { passphrase: PASS, recoveryKey, userId: USER });
	return { envelope, recoveryKey };
}

describe('seal v2 key backups', () => {
	it('round-trips with the passphrase and with the recovery key', async () => {
		const { envelope, recoveryKey } = await sealed();
		expect(dec(await unsealKeys(envelope, { secret: PASS, userId: USER }))).toBe(dec(keys));
		expect(dec(await unsealKeys(envelope, { secret: recoveryKey, userId: USER }))).toBe(dec(keys));
		// typed loosely: lower case, spaces instead of dashes
		const typed = recoveryKey.toLowerCase().replace(/-/g, ' ');
		expect(dec(await unsealKeys(envelope, { secret: typed, userId: USER }))).toBe(dec(keys));
	});

	it('stores nothing that opens it: no plaintext, no passphrase, no data key', async () => {
		const { envelope, recoveryKey } = await sealed();
		const text = JSON.stringify(envelope);
		expect(text).not.toContain('privateKey');
		expect(text).not.toContain(PASS);
		expect(text).not.toContain(recoveryKey);
		expect(sealEnvelopeProblem(envelope)).toBeNull();
		expect(envelope.kdf.iterations).toBe(SEAL_PBKDF2_ITERATIONS);
		expect(SEAL_PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600000);
	});

	it('rejects a wrong passphrase and a wrong recovery key', async () => {
		const { envelope } = await sealed();
		await expect(unsealKeys(envelope, { secret: 'correct horse battery stapler', userId: USER })).rejects.toThrow(
			'Wrong passphrase'
		);
		await expect(unsealKeys(envelope, { secret: generateRecoveryKey(), userId: USER })).rejects.toThrow(
			'Wrong recovery key'
		);
	});

	it("binds the auth user id: another account's row does not open", async () => {
		const { envelope } = await sealed();
		await expect(unsealKeys(envelope, { secret: PASS, userId: 'someone-else' })).rejects.toThrow();
	});

	it('detects tampering with the payload', async () => {
		const { envelope } = await sealed();
		const ct = atob(envelope.payload.ct);
		envelope.payload.ct = btoa(String.fromCharCode(ct.charCodeAt(0) ^ 1) + ct.slice(1));
		await expect(unsealKeys(envelope, { secret: PASS, userId: USER })).rejects.toThrow(/corrupted/);
	});

	it('refuses PINs and weak passphrases', async () => {
		expect(passphraseProblem('4821')).toMatch(/at least/);
		expect(passphraseProblem('123456789012')).toMatch(/number alone/);
		expect(passphraseProblem('aaaaaaaaaaaaaa')).toMatch(/repetitive/);
		expect(passphraseProblem(PASS)).toBeNull();
		await expect(
			sealKeys(keys, { passphrase: '482193', recoveryKey: generateRecoveryKey(), userId: USER })
		).rejects.toThrow();
	});

	it('will not seal below the KDF floor', async () => {
		await expect(
			sealKeys(keys, { passphrase: PASS, recoveryKey: generateRecoveryKey(), userId: USER, iterations: 100000 })
		).rejects.toThrow(/floor/);
	});

	it('recovery keys carry 160 bits and parse back', () => {
		const a = generateRecoveryKey();
		expect(a).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
		expect(parseRecoveryKey(a)).toHaveLength(20);
		expect(generateRecoveryKey()).not.toBe(a);
		expect(looksLikeRecoveryKey(PASS)).toBe(false);
		expect(looksLikeRecoveryKey('4821')).toBe(false);
	});
});

describe('sealEnvelopeProblem (server-side shape check)', () => {
	it('rejects the legacy PIN export format', () => {
		const legacy = { version: '3.0', algorithm: 'ChaCha20-Poly1305-HKDF', encryptedKeys: 'x', kdfIterations: 600000 };
		expect(sealEnvelopeProblem(legacy)).toBe('wrong format or version');
	});

	it('rejects an envelope that claims too few iterations', async () => {
		const { envelope } = await sealed();
		envelope.kdf.iterations = 1000;
		expect(sealEnvelopeProblem(envelope)).toMatch(/floor/);
	});

	it('rejects a plaintext key dump dressed up as a backup', () => {
		expect(sealEnvelopeProblem({ keys1024: { privateKey: 'sk' } })).not.toBeNull();
		expect(sealEnvelopeProblem(null)).not.toBeNull();
		expect(sealEnvelopeProblem([])).not.toBeNull();
	});
});

describe('authUserIdFromToken', () => {
	it('reads sub from a JWT without verifying it', () => {
		const payload = btoa(JSON.stringify({ sub: USER })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
		expect(authUserIdFromToken(`h.${payload}.s`)).toBe(USER);
		expect(authUserIdFromToken('nope')).toBeNull();
		expect(authUserIdFromToken(undefined)).toBeNull();
	});
});
