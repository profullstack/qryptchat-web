import { describe, expect, it, vi } from 'vitest';
import { isBusy, isStale, liveBuild, setBusy, updateAction } from './app-update.js';

describe('app update', () => {
	it('reads the live build id without caching, and copes with offline', async () => {
		const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ buildId: '0.13.0-abc' }) }));
		expect(await liveBuild(fetchImpl)).toBe('0.13.0-abc');
		expect(fetchImpl).toHaveBeenCalledWith('/api/version', { cache: 'no-store' });
		expect(await liveBuild(async () => { throw new TypeError('offline'); })).toBeNull();
		expect(await liveBuild(async () => ({ ok: false }))).toBeNull();
	});

	it('is stale only when both ids are known and differ', () => {
		expect(isStale('b', 'a')).toBe(true);
		expect(isStale('a', 'a')).toBe(false);
		expect(isStale(null, 'a')).toBe(false);
		expect(isStale('b', null)).toBe(false);
	});

	it('reloads on resume when idle, otherwise offers the update', () => {
		expect(updateAction({ stale: true, resumed: true, busy: false })).toBe('reload');
		expect(updateAction({ stale: true, resumed: true, busy: true })).toBe('offer');
		expect(updateAction({ stale: true, resumed: false, busy: false })).toBe('offer');
		expect(updateAction({ stale: false, resumed: true, busy: false })).toBe('none');
	});

	it('tracks what a reload would destroy', () => {
		expect(isBusy()).toBe(false);
		setBusy('composer', true);
		setBusy('voice', true);
		setBusy('composer', false);
		expect(isBusy()).toBe(true);
		setBusy('voice', false);
		expect(isBusy()).toBe(false);
	});
});
