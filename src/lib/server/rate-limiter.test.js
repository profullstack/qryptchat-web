import { afterEach, describe, expect, it } from 'vitest';
import { getClientIp, parseTrustedProxyCount } from './rate-limiter.js';

function requestWithHeaders(headers) {
	return {
		headers: {
			get(name) {
				return headers[name.toLowerCase()] ?? null;
			}
		}
	};
}

describe('trusted proxy parsing', () => {
	const original = process.env.TRUSTED_PROXY_COUNT;

	afterEach(() => {
		if (original === undefined) {
			delete process.env.TRUSTED_PROXY_COUNT;
		} else {
			process.env.TRUSTED_PROXY_COUNT = original;
		}
	});

	it('accepts only unsigned integer proxy counts', () => {
		expect(parseTrustedProxyCount('2')).toBe(2);
		expect(parseTrustedProxyCount(' 01 ')).toBe(1);
		expect(parseTrustedProxyCount('1abc')).toBe(0);
		expect(parseTrustedProxyCount('-1')).toBe(0);
		expect(parseTrustedProxyCount('')).toBe(0);
	});

	it('does not trust X-Forwarded-For when the proxy count is malformed', () => {
		process.env.TRUSTED_PROXY_COUNT = '1abc';
		const request = requestWithHeaders({
			'x-forwarded-for': '203.0.113.9, 198.51.100.10',
			'x-real-ip': '192.0.2.55'
		});

		expect(getClientIp(request)).toBe('192.0.2.55');
	});

	it('uses the nth trusted hop from the right when configured', () => {
		process.env.TRUSTED_PROXY_COUNT = '2';
		const request = requestWithHeaders({
			'x-forwarded-for': '203.0.113.9, 198.51.100.10, 192.0.2.55'
		});

		expect(getClientIp(request)).toBe('198.51.100.10');
	});
});
