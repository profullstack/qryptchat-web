import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		auth: {
			getUser: mocks.authGetUser
		}
	}))
}));

function websocketRequest({ authorization, url = '/socket' }) {
	return {
		url,
		headers: {
			host: 'qrypt.chat',
			...(authorization ? { authorization } : {})
		}
	};
}

describe('authenticateWebSocket bearer token parsing', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
		process.env.PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
	});

	it('normalizes bearer scheme casing and extra spaces', async () => {
		const { authenticateWebSocket } = await import('./auth.js');
		const result = await authenticateWebSocket(
			websocketRequest({ authorization: 'bearer   access-token  ' })
		);

		expect(result.success).toBe(true);
		expect(result.user).toMatchObject({
			id: 'auth-user-id',
			access_token: 'access-token'
		});
		expect(mocks.authGetUser).toHaveBeenCalledWith('access-token');
	});

	it('ignores an empty bearer header and falls back to query tokens', async () => {
		const { authenticateWebSocket } = await import('./auth.js');
		const result = await authenticateWebSocket(
			websocketRequest({
				authorization: 'Bearer   ',
				url: '/socket?token=query-token'
			})
		);

		expect(result.success).toBe(true);
		expect(result.user).toMatchObject({
			id: 'auth-user-id',
			access_token: 'query-token'
		});
		expect(mocks.authGetUser).toHaveBeenCalledWith('query-token');
	});
});
