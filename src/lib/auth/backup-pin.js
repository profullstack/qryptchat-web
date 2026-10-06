// Backup PIN hashing and the server-side check that gates key-backup restore.
//
// A PIN may be 4-12 digits. The encrypted backup itself is only as strong as
// the PIN, so the server never hands it out until the PIN checks out here, and
// repeated failures lock the account's restore for an escalating period.

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const PIN_MIN = 4;
export const PIN_MAX = 12;
export const PIN_PATTERN = /^\d{4,12}$/;
export const PIN_RULE = `PIN must be ${PIN_MIN}-${PIN_MAX} digits`;

// scrypt work factors. N=2^17/r=8/p=1 is OWASP's recommended minimum; the per-user
// salt means there is no shared work across users on top of that.
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
// scrypt needs roughly 128 * N * r bytes; Node's default 32MB cap would reject N=2^17.
const SCRYPT_MAXMEM = 192 * 1024 * 1024;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
export const PIN_ALGORITHM = `scrypt-n${SCRYPT_N}-r${SCRYPT_R}-p${SCRYPT_P}`;

/** Wrong PINs allowed before each lock. */
export const ATTEMPTS_PER_LOCK = 5;
const FIRST_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

/**
 * How long to lock after `failures` consecutive wrong PINs: nothing until a
 * multiple of ATTEMPTS_PER_LOCK, then 15 min, 30 min, 1 h ... capped at 24 h.
 * A 4-digit PIN then takes years to sweep online.
 * @param {number} failures
 */
export function lockDurationMs(failures) {
	if (failures <= 0 || failures % ATTEMPTS_PER_LOCK !== 0) return 0;
	const round = failures / ATTEMPTS_PER_LOCK;
	return Math.min(FIRST_LOCK_MS * 2 ** (round - 1), MAX_LOCK_MS);
}

/**
 * @param {string} pin
 * @param {string} [saltHex] existing salt, hex-encoded; a new one is generated when omitted
 * @returns {Promise<{hash: string, salt: string, algorithm: string}>}
 */
export async function hashPin(pin, saltHex) {
	const salt = saltHex ?? randomBytes(SCRYPT_SALT_BYTES).toString('hex');
	const derived = /** @type {Buffer} */ (
		await scrypt(pin, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM })
	);
	return { hash: derived.toString('hex'), salt, algorithm: PIN_ALGORITHM };
}

/**
 * Resolve the internal users.id for a Supabase Auth user.
 * @param {any} db service-role client
 * @param {{id: string}} user
 */
export async function resolveInternalUserId(db, user) {
	const { data, error } = await db.from('users').select('id').eq('auth_user_id', user.id).single();
	if (error || !data?.id) return { error: error?.message ?? 'User record not found' };
	return { userId: data.id };
}

/**
 * Check a PIN against the user's stored hash, counting failures and enforcing
 * the lockout. The failure is recorded BEFORE the (slow) hash comparison with a
 * compare-and-set on failed_attempts, so parallel guesses cannot slip past the
 * counter; a correct PIN resets it.
 *
 * @param {any} db service-role client
 * @param {string} userId internal users.id
 * @param {string} pin
 * @param {number} [now]
 * @returns {Promise<
 *   {status: 'ok'} |
 *   {status: 'unset'} |
 *   {status: 'required'} |
 *   {status: 'locked', retryAfter: number} |
 *   {status: 'wrong', remaining: number, retryAfter?: number} |
 *   {status: 'error', error: string}
 * >} 'unset' means there is no verifiable hash (no PIN, or a legacy row whose
 *   unsalted hash was discarded), so the caller cannot gate on it.
 */
export async function checkPin(db, userId, pin, now = Date.now()) {
	const { data: row, error } = await db
		.from('user_backup_pins')
		.select('pin_hash, pin_salt, algorithm, failed_attempts, locked_until')
		.eq('user_id', userId)
		.maybeSingle();
	if (error) return { status: 'error', error: error.message };
	if (!row || !row.pin_hash || !row.pin_salt || row.algorithm !== PIN_ALGORITHM) return { status: 'unset' };

	// No PIN offered: say one is needed without spending an attempt on it.
	if (!pin) return { status: 'required' };

	const lockedUntil = row.locked_until ? Date.parse(row.locked_until) : 0;
	if (lockedUntil > now) return { status: 'locked', retryAfter: Math.ceil((lockedUntil - now) / 1000) };

	const failures = (row.failed_attempts ?? 0) + 1;
	const lockMs = lockDurationMs(failures);
	const { data: claimed, error: claimError } = await db
		.from('user_backup_pins')
		.update({ failed_attempts: failures, locked_until: lockMs ? new Date(now + lockMs).toISOString() : null })
		.eq('user_id', userId)
		.eq('failed_attempts', row.failed_attempts ?? 0)
		.select('user_id');
	if (claimError) return { status: 'error', error: claimError.message };
	// Another guess claimed this slot first; treat it as a collision, not a pass.
	if (!claimed?.length) return { status: 'locked', retryAfter: 1 };

	const { hash } = await hashPin(pin, row.pin_salt);
	const a = Buffer.from(hash, 'hex');
	const b = Buffer.from(row.pin_hash, 'hex');
	if (a.length === b.length && timingSafeEqual(a, b)) {
		await db.from('user_backup_pins').update({ failed_attempts: 0, locked_until: null }).eq('user_id', userId);
		return { status: 'ok' };
	}
	const remaining = ATTEMPTS_PER_LOCK - (failures % ATTEMPTS_PER_LOCK || ATTEMPTS_PER_LOCK);
	return lockMs
		? { status: 'wrong', remaining: 0, retryAfter: Math.ceil(lockMs / 1000) }
		: { status: 'wrong', remaining };
}
