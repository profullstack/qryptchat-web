import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	 authGetUser: vi.fn(),
	 from: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		auth: { getUser: mocks.authGetUser },
		from: mocks.from,
	})),
}));

describe('all public keys cookie authentication', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
		process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
		mocks.authGetUser.mockResolvedValue({ data: { user: { id: 'auth-user-id' } }, error: null });
		mocks.from.mockReturnValue({
			select: vi.fn(() => ({
				not: vi.fn(() => Promise.resolve({ data: [{ user_id: 'user-1', public_key: 'key-1' }], error: null })),
			})),
		});
	});

	it('preserves equals padding in base64 auth cookies', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/crypto/public-keys/all', {
				headers: {
					cookie: 'sb-xydzwxwsbgmznthiiscl-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJhYmMiLCJwYWRkaW5nIjoieCJ9==',
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([{ user_id: 'user-1', public_key: 'key-1' }]);
		expect(mocks.authGetUser).toHaveBeenCalledWith('abc');
	});
});
