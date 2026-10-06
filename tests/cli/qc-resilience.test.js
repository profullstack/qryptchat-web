import { describe, it, expect, vi } from 'vitest';
import { QcClient, retryAfterMs } from '../../src/cli/api.js';
import { ephemeralKeypair } from '../../src/cli/crypto.js';

const keys = { keys1024: await ephemeralKeypair() };

const json = (body, status = 200, headers = {}) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const session = () => ({ base: 'https://chat.test', access_token: 'old', refresh_token: 'r1', expires_at: Date.now() / 1000 + 3600, user: { id: 'a' }, keys });

describe('qc under rate limits and token rotation', () => {
	it('waits out a 429 and retries', async () => {
		let calls = 0;
		const fetch = vi.fn(async () => (++calls === 1 ? json({ error: 'slow down' }, 429, { 'Retry-After': '0.01' }) : json({ conversations: [] })));
		const client = new QcClient(session(), { fetch });
		await expect(client.conversations()).resolves.toEqual([]);
		expect(calls).toBe(2);
	});

	it('reads Retry-After, else backs off exponentially', () => {
		expect(retryAfterMs({ headers: new Headers({ 'retry-after': '5' }) })).toBe(5000);
		expect(retryAfterMs({ headers: new Headers() }, 0)).toBe(2000);
		expect(retryAfterMs({ headers: new Headers() }, 2)).toBe(8000);
	});

	it('refreshes once for parallel 401s, not once per request', async () => {
		let refreshes = 0;
		const fetch = vi.fn(async (url, init) => {
			const path = new URL(url).pathname;
			if (path === '/api/cli/token') {
				refreshes++;
				await new Promise((r) => setTimeout(r, 10));
				return json({ access_token: 'new', refresh_token: `r${refreshes + 1}`, expires_at: Date.now() / 1000 + 3600 });
			}
			return init.headers.Authorization === 'Bearer new' ? json({ conversations: [] }) : json({ error: 'expired' }, 401);
		});
		const client = new QcClient(session(), { fetch });
		await Promise.all([client.conversations(), client.conversations(), client.conversations()]);
		expect(refreshes).toBe(1);
		// A late 401 for a token that was already replaced retries without refreshing.
		await client.reauth('old');
		expect(refreshes).toBe(1);
	});

	it('stops the event stream when even a fresh token is refused, instead of rotating tokens forever', async () => {
		let refreshes = 0;
		const fetch = vi.fn(async (url) => {
			if (new URL(url).pathname === '/api/cli/token') {
				refreshes++;
				return json({ access_token: `t${refreshes}`, refresh_token: `r${refreshes + 1}`, expires_at: Date.now() / 1000 + 3600 });
			}
			return new Response('Unauthorized', { status: 401 });
		});
		const client = new QcClient(session(), { fetch });
		await expect(client.events(() => {})).rejects.toThrow(/qc login/);
		expect(refreshes).toBe(1);
	});
});
