import { describe, expect, it } from 'vitest';
import { isPage } from './proxy.js';

describe('isPage', () => {
	it('marks page routes for revalidation and leaves assets and APIs alone', () => {
		for (const p of ['/', '/chat', '/join/abc', '/u/riotcoder']) expect(isPage(p)).toBe(true);
		for (const p of ['/api/version', '/_next/static/chunks/a.js', '/sw.js', '/manifest.json', '/icons/icon-192x192.png']) {
			expect(isPage(p)).toBe(false);
		}
	});
});
