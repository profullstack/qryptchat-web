import { describe, expect, it } from 'vitest';
import { ATTEMPTS_PER_LOCK, checkPin, hashPin, lockDurationMs, PIN_PATTERN } from './backup-pin.js';

/** A one-row stand-in for the service-role client's user_backup_pins queries. */
function fakeDb(row, { onRead } = {}) {
	const state = { row };
	return {
		state,
		from() {
			let op = 'select';
			let patch = null;
			const filters = [];
			const matches = () => state.row && filters.every(([k, v]) => state.row[k] === v);
			const run = () => {
				if (op !== 'update') return Promise.resolve({ data: null, error: null });
				if (!matches()) return Promise.resolve({ data: [], error: null });
				Object.assign(state.row, patch);
				return Promise.resolve({ data: [{ user_id: state.row.user_id }], error: null });
			};
			const q = {
				select: () => q,
				eq: (k, v) => (filters.push([k, v]), q),
				update: (p) => ((op = 'update'), (patch = p), q),
				maybeSingle: () => {
					const data = matches() ? { ...state.row } : null;
					onRead?.(state);
					return Promise.resolve({ data, error: null });
				},
				then: (res, rej) => run().then(res, rej)
			};
			return q;
		}
	};
}

async function pinRow(pin) {
	const { hash, salt, algorithm } = await hashPin(pin);
	return { user_id: 'u1', pin_hash: hash, pin_salt: salt, algorithm, failed_attempts: 0, locked_until: null };
}

describe('backup PIN rules', () => {
	it('allows 4-12 digit PINs', () => {
		expect(PIN_PATTERN.test('1234')).toBe(true);
		expect(PIN_PATTERN.test('123456789012')).toBe(true);
		expect(PIN_PATTERN.test('123')).toBe(false);
		expect(PIN_PATTERN.test('1234567890123')).toBe(false);
		expect(PIN_PATTERN.test('12a4')).toBe(false);
	});

	it('locks after every fifth miss, doubling from 15 minutes up to a day', () => {
		expect(lockDurationMs(4)).toBe(0);
		expect(lockDurationMs(5)).toBe(15 * 60 * 1000);
		expect(lockDurationMs(10)).toBe(30 * 60 * 1000);
		expect(lockDurationMs(15)).toBe(60 * 60 * 1000);
		expect(lockDurationMs(100)).toBe(24 * 60 * 60 * 1000);
	});
});

describe('checkPin', () => {
	it('passes the right PIN and resets the failure count', async () => {
		const db = fakeDb({ ...(await pinRow('4821')), failed_attempts: 3 });
		expect(await checkPin(db, 'u1', '4821')).toEqual({ status: 'ok' });
		expect(db.state.row.failed_attempts).toBe(0);
	});

	it('counts misses, then locks and refuses even the right PIN until the lock ends', async () => {
		const db = fakeDb(await pinRow('4821'));
		const now = Date.parse('2026-10-06T10:00:00Z');
		for (let i = 1; i < ATTEMPTS_PER_LOCK; i++) {
			expect(await checkPin(db, 'u1', '0000', now)).toEqual({ status: 'wrong', remaining: ATTEMPTS_PER_LOCK - i });
		}
		expect(await checkPin(db, 'u1', '0000', now)).toEqual({ status: 'wrong', remaining: 0, retryAfter: 900 });
		expect(await checkPin(db, 'u1', '4821', now + 1000)).toEqual({ status: 'locked', retryAfter: 899 });
		expect(await checkPin(db, 'u1', '4821', now + 901_000)).toEqual({ status: 'ok' });
	});

	it('asks for a PIN without spending an attempt', async () => {
		const db = fakeDb(await pinRow('4821'));
		expect(await checkPin(db, 'u1', '')).toEqual({ status: 'required' });
		expect(db.state.row.failed_attempts).toBe(0);
	});

	it('reports unset for no row and for a legacy row with a discarded hash', async () => {
		expect(await checkPin(fakeDb(null), 'u1', '4821')).toEqual({ status: 'unset' });
		const legacy = { user_id: 'u1', pin_hash: null, pin_salt: null, algorithm: 'legacy-sha256-discarded', failed_attempts: 0 };
		expect(await checkPin(fakeDb(legacy), 'u1', '4821')).toEqual({ status: 'unset' });
	});

	it('does not pass a guess that lost the race for the attempt slot', async () => {
		// Another request bumps the counter between this one's read and its claim.
		const db = fakeDb(await pinRow('4821'), {
			onRead: (state) => {
				state.row.failed_attempts = 1;
			}
		});
		expect(await checkPin(db, 'u1', '4821')).toEqual({ status: 'locked', retryAfter: 1 });
	});
});
