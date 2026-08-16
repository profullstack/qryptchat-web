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
	});

	it('defaults to one trusted hop when unconfigured', () => {
		// Every shipped deployment runs behind exactly one platform proxy; a
		// direct-to-internet deployment has to opt out with an explicit 0.
		expect(parseTrustedProxyCount(undefined)).toBe(1);
		expect(parseTrustedProxyCount('')).toBe(1);
		expect(parseTrustedProxyCount('0')).toBe(0);
	});

	it('trusts no forwarding header when the proxy count is malformed', () => {
		// A malformed count must fail closed. Falling back to X-Real-IP here is what
		// let an attacker rotate the header and mint a fresh rate-limit bucket per
		// request (GHSA-64m7-3h2w-2qr6).
		process.env.TRUSTED_PROXY_COUNT = '1abc';
		const request = requestWithHeaders({
			'x-forwarded-for': '203.0.113.9, 198.51.100.10',
			'x-real-ip': '192.0.2.55'
		});

		expect(getClientIp(request)).toBe('unknown');
	});

	it('ignores a spoofed X-Real-IP when no proxy is trusted', () => {
		process.env.TRUSTED_PROXY_COUNT = '0';
		const first = getClientIp(requestWithHeaders({ 'x-real-ip': '198.51.100.1' }));
		const second = getClientIp(requestWithHeaders({ 'x-real-ip': '198.51.100.2' }));

		// Rotating the header must not yield a different rate-limit key.
		expect(first).toBe(second);
	});

	it('uses the nth trusted hop from the right when configured', () => {
		process.env.TRUSTED_PROXY_COUNT = '2';
		const request = requestWithHeaders({
			'x-forwarded-for': '203.0.113.9, 198.51.100.10, 192.0.2.55'
		});

		expect(getClientIp(request)).toBe('198.51.100.10');
	});
});
