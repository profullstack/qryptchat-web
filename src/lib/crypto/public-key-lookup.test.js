import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRetrying, KeyLookupError, publicKeyService } from './public-key-service.js';

const res = (status, body = {}, headers = {}) => ({
	ok: status >= 200 && status < 300,
	status,
	statusText: '',
	headers: { get: (k) => headers[k.toLowerCase()] ?? null },
	json: async () => body,
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchRetrying', () => {
	it('waits out a 429 and returns the retry', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(res(429, {}, { 'retry-after': '1' })).mockResolvedValueOnce(res(200));
		vi.stubGlobal('fetch', fetch);
		const sleep = vi.fn(async () => {});
		const out = await fetchRetrying('/api/x', undefined, { sleep });
		expect(out.status).toBe(200);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(1000);
	});

	it('gives up after three tries and hands back the 429', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(429)));
		const out = await fetchRetrying('/api/x', undefined, { sleep: async () => {} });
		expect(out.status).toBe(429);
		expect(fetch).toHaveBeenCalledTimes(3);
	});
});

describe('getConversationParticipantKeys', () => {
	it('reports a rate limit as a rate limit, not as missing keys', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(429, {}, { 'retry-after': '0' })));
		vi.useFakeTimers();
		const p = publicKeyService.getConversationParticipantKeys('c1');
		const done = expect(p).rejects.toBeInstanceOf(KeyLookupError);
		await vi.runAllTimersAsync();
		await done;
		await expect(p).rejects.toThrow(/rate limited/);
		vi.useRealTimers();
	});
});
