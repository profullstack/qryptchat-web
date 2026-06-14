/**
 * @fileoverview Unit tests for the CoinPay OAuth helpers:
 * username derivation/uniqueness, state validation, PKCE/state generation,
 * authorize-URL building, and the mocked token/userinfo exchange.
 */

import { describe, it, expect, vi } from 'vitest';
import {
	sanitizeUsernameBase,
	deriveUsernameBase,
	deriveUniqueUsername,
	validateState,
	generateState,
	generatePkcePair,
	buildAuthorizeUrl,
	getRedirectUri,
	exchangeCodeForToken,
	fetchUserinfo,
	COINPAY_SCOPES
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

describe('validateState', () => {
	it('returns true for matching non-empty strings', () => {
		const s = generateState();
		expect(validateState(s, s)).toBe(true);
	});
	it('returns false for mismatch', () => {
		expect(validateState('aaaa', 'bbbb')).toBe(false);
	});
	it('returns false when either side missing', () => {
		expect(validateState('', 'x')).toBe(false);
		expect(validateState('x', null)).toBe(false);
		expect(validateState(undefined, undefined)).toBe(false);
	});
	it('returns false for differing lengths', () => {
		expect(validateState('abc', 'abcd')).toBe(false);
	});
});

describe('generateState / generatePkcePair', () => {
	it('generates distinct random state values', () => {
		expect(generateState()).not.toBe(generateState());
	});
	it('produces a verifier and an S256 challenge', () => {
		const { codeVerifier, codeChallenge } = generatePkcePair();
		expect(codeVerifier).toBeTruthy();
		expect(codeChallenge).toBeTruthy();
		expect(codeChallenge).not.toBe(codeVerifier);
		// base64url: no +, /, or = chars
		expect(/[+/=]/.test(codeChallenge)).toBe(false);
	});
});

describe('buildAuthorizeUrl', () => {
	it('includes required OAuth params and PKCE', () => {
		const u = new URL(
			buildAuthorizeUrl({
				issuer: 'https://coinpayportal.com',
				clientId: 'cid',
				redirectUri: 'https://app.test/api/auth/coinpay/callback',
				state: 'st8',
				codeChallenge: 'chal'
			})
		);
		expect(u.pathname).toBe('/api/oauth/authorize');
		expect(u.searchParams.get('response_type')).toBe('code');
		expect(u.searchParams.get('client_id')).toBe('cid');
		expect(u.searchParams.get('scope')).toBe(COINPAY_SCOPES);
		expect(u.searchParams.get('state')).toBe('st8');
		expect(u.searchParams.get('code_challenge')).toBe('chal');
		expect(u.searchParams.get('code_challenge_method')).toBe('S256');
	});
	it('omits PKCE params when no challenge provided', () => {
		const u = new URL(
			buildAuthorizeUrl({
				issuer: 'https://coinpayportal.com',
				clientId: 'cid',
				redirectUri: 'https://app.test/cb',
				state: 'st8'
			})
		);
		expect(u.searchParams.get('code_challenge')).toBeNull();
	});
});

describe('getRedirectUri', () => {
	it('builds the callback path off the app origin', () => {
		expect(getRedirectUri('https://app.test')).toBe('https://app.test/api/auth/coinpay/callback');
	});
});

describe('exchangeCodeForToken (mocked fetch)', () => {
	it('posts form-encoded params and returns tokens', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ access_token: 'at', refresh_token: 'rt', id_token: 'it' })
		});
		const tokens = await exchangeCodeForToken(
			{
				issuer: 'https://coinpayportal.com',
				code: 'authcode',
				redirectUri: 'https://app.test/cb',
				clientId: 'cid',
				clientSecret: 'secret',
				codeVerifier: 'ver'
			},
			fetchImpl
		);
		expect(tokens.access_token).toBe('at');
		const [calledUrl, opts] = fetchImpl.mock.calls[0];
		expect(calledUrl).toBe('https://coinpayportal.com/api/oauth/token');
		expect(opts.method).toBe('POST');
		expect(opts.body).toContain('grant_type=authorization_code');
		expect(opts.body).toContain('code_verifier=ver');
	});

	it('throws on non-ok response', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
		await expect(
			exchangeCodeForToken(
				{ issuer: 'https://x', code: 'c', redirectUri: 'r', clientId: 'i', clientSecret: 's' },
				fetchImpl
			)
		).rejects.toThrow(/token exchange failed/i);
	});

	it('throws when access_token is missing', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
		await expect(
			exchangeCodeForToken(
				{ issuer: 'https://x', code: 'c', redirectUri: 'r', clientId: 'i', clientSecret: 's' },
				fetchImpl
			)
		).rejects.toThrow(/missing access_token/i);
	});
});

describe('fetchUserinfo (mocked fetch)', () => {
	it('sends bearer token and returns claims', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ sub: 'u1', email: 'a@b.com', name: 'Alice' })
		});
		const claims = await fetchUserinfo(
			{ issuer: 'https://coinpayportal.com', accessToken: 'at' },
			fetchImpl
		);
		expect(claims.email).toBe('a@b.com');
		const [calledUrl, opts] = fetchImpl.mock.calls[0];
		expect(calledUrl).toBe('https://coinpayportal.com/api/oauth/userinfo');
		expect(opts.headers.Authorization).toBe('Bearer at');
	});

	it('throws when neither sub nor email present', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
		await expect(
			fetchUserinfo({ issuer: 'https://x', accessToken: 'at' }, fetchImpl)
		).rejects.toThrow(/missing sub\/email/i);
	});
});
