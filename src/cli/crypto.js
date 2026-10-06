/**
 * The web app's own post-quantum crypto (ML-KEM-1024 + HKDF + ChaCha20-Poly1305),
 * run in Node/Bun with keys handed in rather than loaded from IndexedDB. The
 * service logs every step to the console, which a full-screen TUI cannot have,
 * so every call runs with the console muted.
 */
import { MlKem1024 } from 'mlkem';
import { PostQuantumEncryptionService } from '../lib/crypto/post-quantum-encryption.js';
import { Base64 } from '../lib/crypto/index.js';

const METHODS = ['log', 'info', 'warn', 'error', 'debug'];

/** Run fn with the console silenced (the crypto modules are chatty). */
export async function quietly(fn) {
	const saved = METHODS.map((m) => console[m]);
	for (const m of METHODS) console[m] = () => {};
	try {
		return await fn();
	} finally {
		METHODS.forEach((m, i) => (console[m] = saved[i]));
	}
}

/**
 * A crypto service holding the account's keys.
 * keys: { keys1024: {publicKey, privateKey}, keys768?: {publicKey, privateKey} }
 */
export function keyring(keys) {
	const service = new PostQuantumEncryptionService();
	service.userKeys = { publicKey: keys.keys1024.publicKey, privateKey: keys.keys1024.privateKey };
	if (keys.keys768) service.userKeys768 = { publicKey: keys.keys768.publicKey, privateKey: keys.keys768.privateKey };
	service.isInitialized = true;
	return {
		encrypt: (text, recipientPublicKey) => quietly(() => service.encryptForRecipient(text, recipientPublicKey)),
		/** Plaintext, or a bracketed placeholder the web app also shows when a copy cannot be opened. */
		decrypt: (content) => quietly(() => service.decryptFromSender(content, '')),
	};
}

/** A one-time ML-KEM-1024 keypair for `qc login`, base64 like the app's keys. */
export async function ephemeralKeypair() {
	const [publicKey, privateKey] = await new MlKem1024().generateKeyPair();
	return { publicKey: Base64.encode(publicKey), privateKey: Base64.encode(privateKey) };
}

/** Open the keypair the browser sealed to our ephemeral key during login. */
export async function openKeyBlob(blob, ephemeral) {
	const ring = keyring({ keys1024: ephemeral });
	const text = await ring.decrypt(blob);
	let keys;
	try {
		keys = JSON.parse(text);
	} catch {
		throw new Error('Could not open the keys the browser sent. Run qc login again.');
	}
	if (!keys?.keys1024?.publicKey || !keys?.keys1024?.privateKey) throw new Error('The browser sent no usable keys.');
	return { keys1024: keys.keys1024, keys768: keys.keys768 };
}
