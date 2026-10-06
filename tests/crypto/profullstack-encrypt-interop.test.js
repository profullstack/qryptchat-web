import { describe, expect, it } from 'vitest';
import { MlKem1024, MlKem768 } from 'mlkem';
import { decrypt, encrypt, generateKeyPair } from '@profullstack/encrypt';
import { PostQuantumEncryptionService } from '../../src/lib/crypto/post-quantum-encryption.js';
import { Base64 } from '../../src/lib/crypto/index.js';

/** A service holding a given keypair, without IndexedDB. */
async function serviceWith({ publicKey, privateKey }, keys768) {
	const svc = new PostQuantumEncryptionService();
	svc.isInitialized = true;
	svc.userKeys = { publicKey, privateKey };
	if (keys768) svc.userKeys768 = keys768;
	return svc;
}

describe('qrypt.chat encryption runs on @profullstack/encrypt', () => {
	it('what qrypt.chat seals, the library opens, and the other way round', async () => {
		const pair = await generateKeyPair();
		const svc = await serviceWith(pair);

		const fromApp = await svc.encryptForRecipient('app -> lib 🔐', pair.publicKey);
		expect(JSON.parse(fromApp)).toMatchObject({ v: 3, alg: 'ML-KEM-1024' });
		expect(await decrypt(fromApp, pair.privateKey)).toBe('app -> lib 🔐');

		const fromLib = await encrypt('lib -> app ✅', pair.publicKey);
		expect(await svc.decryptFromSender(fromLib, '')).toBe('lib -> app ✅');
	});

	it('a 768 public key gets ML-KEM-768, opened with the 768 keys', async () => {
		const [pk, sk] = await new MlKem768().generateKeyPair();
		const k768 = { publicKey: Base64.encode(pk), privateKey: Base64.encode(sk) };
		const svc = await serviceWith(await generateKeyPair(), k768);
		const sealed = await svc.encryptForRecipient('old style', k768.publicKey);
		expect(JSON.parse(sealed).alg).toBe('ML-KEM-768');
		expect(await svc.decryptFromSender(sealed, '')).toBe('old style');
	});

	it('still reads envelopes written with the long field names', async () => {
		const pair = await generateKeyPair();
		const svc = await serviceWith(pair);
		const e = JSON.parse(await encrypt('long names', pair.publicKey));
		const legacy = JSON.stringify({ version: 3, algorithm: e.alg, kemCiphertext: e.kem, salt: e.s, nonce: e.n, ciphertext: e.c });
		expect(await svc.decryptFromSender(legacy, '')).toBe('long names');
	});

	it('keeps the friendly results instead of throwing', async () => {
		const mine = await generateKeyPair();
		const theirs = await generateKeyPair();
		const svc = await serviceWith(mine);
		expect(await svc.decryptFromSender('not json', '')).toBe('[Encrypted message]');
		expect(await svc.decryptFromSender(JSON.stringify({ alg: 'FALLBACK-AES-GCM' }), '')).toBe('[Legacy encrypted message - please delete]');
		expect(await svc.decryptFromSender(JSON.stringify({ v: 2 }), '')).toBe('[Encrypted message - format error]');
		const notForMe = await encrypt('secret', theirs.publicKey);
		expect(await svc.decryptFromSender(notForMe, '')).toBe('[Encrypted message - decryption failed]');
	});

	it('refuses a public key of the wrong size before encrypting', async () => {
		const svc = await serviceWith(await generateKeyPair());
		await expect(svc.encryptForRecipient('x', Base64.encode(new Uint8Array(100)))).rejects.toThrow(/Invalid recipient public key size/);
	});

	it('raw ML-KEM keys from mlkem work as before', async () => {
		const [pk, sk] = await new MlKem1024().generateKeyPair();
		const svc = await serviceWith({ publicKey: Base64.encode(pk), privateKey: Base64.encode(sk) });
		expect(await svc.decryptFromSender(await svc.encryptForRecipient('raw', Base64.encode(pk)), '')).toBe('raw');
	});
});
