import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installApiAuth, isOwnApi } from './auth-fetch.js';

const ORIGIN = 'https://qrypt.chat';

const store = new Map();
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };

function fakeWindow() {
	const calls = [];
	return {
		calls,
		localStorage: storage,
		location: { origin: ORIGIN },
		fetch: vi.fn(async (input, init = {}) => {
			calls.push({ input, auth: new Headers(init.headers).get('authorization') });
			return new Response('{}');
		}),
	};
}

const session = (expiresInS, token = 'tok') =>
	storage.setItem('qrypt_session', JSON.stringify({ access_token: token, refresh_token: 'r1', expires_at: Date.now() / 1000 + expiresInS }));

describe('installApiAuth', () => {
	beforeEach(() => store.clear());

	it('adds the session token to our own /api/ calls (cookie-less passkey/CoinPay sessions)', async () => {
		session(3600);
		const w = fakeWindow();
		installApiAuth({ target: w });
		await w.fetch('/api/crypto/public-keys', { method: 'POST' });
		expect(w.calls[0].auth).toBe('Bearer tok');
	});

	it('leaves other origins, non-api paths and explicit Authorization alone', async () => {
		session(3600);
		const w = fakeWindow();
		installApiAuth({ target: w });
		await w.fetch('https://evil.example/api/x');
		await w.fetch('/chat');
		await w.fetch('/api/x', { headers: { Authorization: 'Bearer mine' } });
		expect(w.calls.map((c) => c.auth)).toEqual([null, null, 'Bearer mine']);
	});

	it('refreshes an expiring token once for many parallel requests', async () => {
		session(5, 'old');
		const refresh = vi.fn(async () => {
			await new Promise((r) => setTimeout(r, 5));
			return { success: true, session: { access_token: 'new' } };
		});
		const w = fakeWindow();
		installApiAuth({ target: w, refresh });
		await Promise.all([w.fetch('/api/a'), w.fetch('/api/b'), w.fetch('/api/c')]);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(w.calls.map((c) => c.auth)).toEqual(['Bearer new', 'Bearer new', 'Bearer new']);
	});

	it('sends the request without a token when there is no session', async () => {
		const w = fakeWindow();
		installApiAuth({ target: w });
		await w.fetch('/api/x');
		expect(w.calls[0].auth).toBeNull();
	});

	it('never targets the token endpoint itself', () => {
		expect(isOwnApi('/api/cli/token', ORIGIN)).toBe(false);
		expect(isOwnApi('/api/messages/send', ORIGIN)).toBe(true);
	});
});
