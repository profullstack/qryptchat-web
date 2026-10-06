import { describe, expect, it } from 'vitest';
import { bearerToken } from './bearer.js';

const req = (authorization) => new Request('https://qrypt.chat/x', authorization ? { headers: { authorization } } : {});

describe('bearerToken', () => {
	it('reads the token, whatever the scheme casing and spacing', () => {
		expect(bearerToken(req('Bearer abc'))).toBe('abc');
		expect(bearerToken(req('bearer   abc  '))).toBe('abc');
	});

	it('is null without a usable Bearer header', () => {
		expect(bearerToken(req())).toBeNull();
		expect(bearerToken(req('Basic abc'))).toBeNull();
		expect(bearerToken(req('Bearer '))).toBeNull();
	});
});
