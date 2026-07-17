/**
 * @fileoverview Unit tests for the CoinPay OAuth helpers that remain app-side:
 * username derivation/uniqueness and the redirect-URI builder.
 *
 * The generic OAuth helpers (state/PKCE generation, state validation,
 * authorize-URL building, token/userinfo exchange) moved to
 * `@profullstack/stack/coinpay` and are covered by that package's own tests.
 */

import { describe, it, expect, vi } from 'vitest';
import {
	sanitizeUsernameBase,
	deriveUsernameBase,
	deriveUniqueUsername,
	getRedirectUri
} from '../src/lib/auth/coinpay.js';

describe('sanitizeUsernameBase', () => {
	it('lowercases and strips disallowed characters', () => {
		expect(sanitizeUsernameBase('John Doe!')).toBe('john_doe');
	});
	it('collapses repeated separators and trims edges', () => {
		expect(sanitizeUsernameBase('  --Foo..Bar--  ')).toBe('foo_bar');
	});
	it('caps length at 24 chars', () => {
		expect(sanitizeUsernameBase('a'.repeat(40)).length).toBe(24);
	});
	it('returns empty string for nothing usable', () => {
		expect(sanitizeUsernameBase('!!!')).toBe('');
		expect(sanitizeUsernameBase(undefined)).toBe('');
	});
});

describe('deriveUsernameBase', () => {
	it('prefers name over email', () => {
		expect(deriveUsernameBase({ name: 'Alice Smith', email: 'x@y.com' })).toBe('alice_smith');
	});
	it('falls back to email local-part', () => {
		expect(deriveUsernameBase({ email: 'bob.jones@example.com' })).toBe('bob_jones');
	});
	it('falls back to "user" when nothing usable', () => {
		expect(deriveUsernameBase({ name: '!!!', email: '' })).toBe('user');
		expect(deriveUsernameBase({})).toBe('user');
	});
});

describe('deriveUniqueUsername', () => {
	it('returns the base when it is available', async () => {
		const isTaken = vi.fn().mockResolvedValue(false);
		const result = await deriveUniqueUsername({ name: 'Alice' }, isTaken);
		expect(result).toBe('alice');
		expect(isTaken).toHaveBeenCalledOnce();
	});

	it('appends a random suffix on collision', async () => {
		// Base taken, first suffixed candidate free.
		const isTaken = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		const result = await deriveUniqueUsername({ name: 'Alice' }, isTaken);
		expect(result).not.toBe('alice');
		expect(result.startsWith('alice_')).toBe(true);
		expect(isTaken).toHaveBeenCalledTimes(2);
	});

	it('throws if no unique username can be found', async () => {
		const isTaken = vi.fn().mockResolvedValue(true);
		await expect(deriveUniqueUsername({ name: 'Alice' }, isTaken, { maxAttempts: 3 })).rejects.toThrow(
			/unique username/i
		);
	});
});

describe('getRedirectUri', () => {
	it('builds the callback path off the app origin', () => {
		expect(getRedirectUri('https://app.test')).toBe('https://app.test/api/auth/coinpay/callback');
	});
});
