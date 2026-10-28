/**
 * Key backup sealing, version 2 ("seal v2").
 *
 * The server stores a user's E2EE private keys only as a blob it cannot open.
 * Everything here runs in the browser with WebCrypto; the server only ever sees
 * the envelope this module produces, never the passphrase, the recovery key or
 * any key derived from them.
 *
 * Why not a PIN any more: a 4-12 digit PIN has at most ~40 bits, and the first
 * backups had 4. Whoever holds the database (a leak, or root on the box) can
 * try all 10,000 4-digit PINs offline in seconds whatever the KDF; a server-side
 * attempt counter does not help once the ciphertext is out. So a backup is now
 * sealed under either:
 *   - a passphrase (>= 12 characters, not digits only), stretched with
 *     PBKDF2-SHA256 at 600,000 iterations, or
 *   - a random 160-bit recovery key, shown once when the backup is written.
 *
 * Layout: a random 256-bit data key encrypts the keys (AES-256-GCM). The data
 * key is wrapped twice, once under each secret, so either one restores. Every
 * AES-GCM call binds the auth user id and the field name as additional data, so
 * a blob copied into another account's row does not open there.
 */

export const SEAL_FORMAT = 'qrypt-key-backup';
export const SEAL_VERSION = 2;
export const SEAL_PBKDF2_ITERATIONS = 600000;
export const PASSPHRASE_MIN = 12;

const RECOVERY_KEY_BYTES = 20; // 160 bits -> 32 base32 characters
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** @returns {Crypto} */
function webcrypto() {
	const c = globalThis.crypto;
	if (!c?.subtle) throw new Error('WebCrypto is not available');
	return c;
}

const enc = new TextEncoder();

/** @param {Uint8Array} bytes */
function b64(bytes) {
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return btoa(s);
}

/** @param {string} str */
function unb64(str) {
	const s = atob(str);
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}

/** @param {number} n */
function randomBytes(n) {
	return webcrypto().getRandomValues(new Uint8Array(n));
}

/**
 * Why a passphrase is not acceptable for a key backup, or null when it is.
 * @param {string} passphrase
 * @returns {string|null}
 */
export function passphraseProblem(passphrase) {
	if (typeof passphrase !== 'string' || passphrase.length === 0) return 'Enter a backup passphrase';
	if (passphrase.length < PASSPHRASE_MIN) return `Use at least ${PASSPHRASE_MIN} characters`;
	if (/^\d+$/.test(passphrase)) return 'A number alone is too easy to guess; use words';
	if (new Set(passphrase).size < 5) return 'Too repetitive; use a few different words';
	return null;
}

/** A new recovery key, formatted XXXX-XXXX-... (Crockford base32). */
export function generateRecoveryKey() {
	const bytes = randomBytes(RECOVERY_KEY_BYTES);
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += CROCKFORD[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
	return out.match(/.{1,4}/g).join('-');
}

/**
 * The raw bytes of a recovery key as typed (case, dashes and spaces ignored;
 * O/I/L read as 0/1/1), or null when it is not one.
 * @param {string} text
 * @returns {Uint8Array|null}
 */
export function parseRecoveryKey(text) {
	if (typeof text !== 'string') return null;
	const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
	if (clean.length !== Math.ceil((RECOVERY_KEY_BYTES * 8) / 5)) return null;
	const out = new Uint8Array(RECOVERY_KEY_BYTES);
	let bits = 0;
	let value = 0;
	let i = 0;
	for (const ch of clean) {
		const v = CROCKFORD.indexOf(ch);
		if (v < 0) return null;
		value = (value << 5) | v;
		bits += 5;
		if (bits >= 8) {
			if (i < out.length) out[i++] = (value >>> (bits - 8)) & 255;
			bits -= 8;
		}
	}
	return i === out.length ? out : null;
}

/** @param {string} text */
export function looksLikeRecoveryKey(text) {
	return parseRecoveryKey(text) !== null;
}

/** @param {string} userId @param {string} field */
function aad(userId, field) {
	return enc.encode(`qrypt.chat/key_backups/v${SEAL_VERSION}/${userId}/${field}`);
}

/** @param {string} passphrase @param {Uint8Array} salt @param {number} iterations */
async function passphraseKek(passphrase, salt, iterations) {
	const subtle = webcrypto().subtle;
	const material = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
	const stretched = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256);
	const hkdf = await subtle.importKey('raw', stretched, 'HKDF', false, ['deriveKey']);
	return subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('qrypt key-backup v2 passphrase kek') },
		hkdf,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/** @param {Uint8Array} recoveryBytes @param {Uint8Array} salt */
async function recoveryKek(recoveryBytes, salt) {
	const subtle = webcrypto().subtle;
	const hkdf = await subtle.importKey('raw', recoveryBytes, 'HKDF', false, ['deriveKey']);
	return subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('qrypt key-backup v2 recovery kek') },
		hkdf,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/** @param {CryptoKey} key @param {Uint8Array} data @param {Uint8Array} additionalData */
async function gcmSeal(key, data, additionalData) {
	const iv = randomBytes(IV_BYTES);
	const ct = new Uint8Array(await webcrypto().subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, data));
	return { iv: b64(iv), ct: b64(ct) };
}

/** @param {CryptoKey} key @param {{iv: string, ct: string}} box @param {Uint8Array} additionalData */
async function gcmOpen(key, box, additionalData) {
	return new Uint8Array(
		await webcrypto().subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData }, key, unb64(box.ct))
	);
}

/**
 * Seal key material for the server.
 * @param {Uint8Array} plaintext the serialized keys
 * @param {{passphrase: string, recoveryKey: string, userId: string, iterations?: number}} opts
 *   userId is the Supabase Auth id (key_backups.user_id).
 * @returns {Promise<object>} the envelope to store as key_backups.encrypted_keys (JSON)
 */
export async function sealKeys(plaintext, { passphrase, recoveryKey, userId, iterations = SEAL_PBKDF2_ITERATIONS }) {
	const problem = passphraseProblem(passphrase);
	if (problem) throw new Error(problem);
	const recoveryBytes = parseRecoveryKey(recoveryKey);
	if (!recoveryBytes) throw new Error('Invalid recovery key');
	if (!userId) throw new Error('A user id is required to seal a backup');
	if (!(iterations >= SEAL_PBKDF2_ITERATIONS)) throw new Error('PBKDF2 iterations below the floor');

	const subtle = webcrypto().subtle;
	const dataKeyBytes = randomBytes(32);
	const dataKey = await subtle.importKey('raw', dataKeyBytes, 'AES-GCM', false, ['encrypt']);

	const kdfSalt = randomBytes(SALT_BYTES);
	const recoverySalt = randomBytes(SALT_BYTES);
	const pKek = await passphraseKek(passphrase, kdfSalt, iterations);
	const rKek = await recoveryKek(recoveryBytes, recoverySalt);

	const envelope = {
		format: SEAL_FORMAT,
		version: SEAL_VERSION,
		cipher: 'AES-256-GCM',
		kdf: { name: 'PBKDF2-SHA256', iterations, salt: b64(kdfSalt) },
		wraps: {
			passphrase: await gcmSeal(pKek, dataKeyBytes, aad(userId, 'wrap:passphrase')),
			recovery: { salt: b64(recoverySalt), ...(await gcmSeal(rKek, dataKeyBytes, aad(userId, 'wrap:recovery'))) }
		},
		payload: await gcmSeal(dataKey, plaintext, aad(userId, 'payload')),
		createdAt: new Date().toISOString()
	};
	dataKeyBytes.fill(0);
	recoveryBytes.fill(0);
	return envelope;
}

/**
 * Open a sealed backup with either the passphrase or the recovery key.
 * @param {object} envelope
 * @param {{secret: string, userId: string}} opts
 * @returns {Promise<Uint8Array>} the serialized keys
 */
export async function unsealKeys(envelope, { secret, userId }) {
	const shape = sealEnvelopeProblem(envelope);
	if (shape) throw new Error(`Not a sealed backup: ${shape}`);
	const recoveryBytes = parseRecoveryKey(secret);
	let dataKeyBytes;
	try {
		if (recoveryBytes) {
			const rKek = await recoveryKek(recoveryBytes, unb64(envelope.wraps.recovery.salt));
			dataKeyBytes = await gcmOpen(rKek, envelope.wraps.recovery, aad(userId, 'wrap:recovery'));
		} else {
			const pKek = await passphraseKek(secret, unb64(envelope.kdf.salt), envelope.kdf.iterations);
			dataKeyBytes = await gcmOpen(pKek, envelope.wraps.passphrase, aad(userId, 'wrap:passphrase'));
		}
	} catch {
		throw new Error(recoveryBytes ? 'Wrong recovery key' : 'Wrong passphrase');
	} finally {
		recoveryBytes?.fill(0);
	}
	const dataKey = await webcrypto().subtle.importKey('raw', dataKeyBytes, 'AES-GCM', false, ['decrypt']);
	dataKeyBytes.fill(0);
	try {
		return await gcmOpen(dataKey, envelope.payload, aad(userId, 'payload'));
	} catch {
		throw new Error('Backup is corrupted or belongs to another account');
	}
}

/** @param {unknown} box */
function isBox(box) {
	return !!box && typeof box === 'object' && typeof box.iv === 'string' && typeof box.ct === 'string';
}

/**
 * Structural check (no secrets needed), used by the server before storing a
 * backup: why this is not a seal-v2 envelope, or null when it is.
 * @param {any} env
 * @returns {string|null}
 */
export function sealEnvelopeProblem(env) {
	if (!env || typeof env !== 'object' || Array.isArray(env)) return 'not an object';
	if (env.format !== SEAL_FORMAT || env.version !== SEAL_VERSION) return 'wrong format or version';
	if (env.cipher !== 'AES-256-GCM') return 'unsupported cipher';
	if (env.kdf?.name !== 'PBKDF2-SHA256' || typeof env.kdf.salt !== 'string') return 'unsupported kdf';
	if (!Number.isInteger(env.kdf.iterations) || env.kdf.iterations < SEAL_PBKDF2_ITERATIONS) return 'kdf iterations below the floor';
	if (!isBox(env.wraps?.passphrase) || !isBox(env.wraps?.recovery) || typeof env.wraps.recovery.salt !== 'string') {
		return 'missing key wraps';
	}
	if (!isBox(env.payload)) return 'missing payload';
	return null;
}

/**
 * The Supabase Auth user id (JWT `sub`) of an access token, read locally. Used
 * only as AAD, so an unverified read is fine: a wrong id just fails to open.
 * @param {string|undefined|null} accessToken
 * @returns {string|null}
 */
export function authUserIdFromToken(accessToken) {
	try {
		const part = String(accessToken).split('.')[1];
		const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
		const sub = JSON.parse(json).sub;
		return typeof sub === 'string' && sub ? sub : null;
	} catch {
		return null;
	}
}
