import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const getUser = vi.fn();
	const eq = vi.fn(() => ({ single: async () => ({ data: { id: 'row-1', username: 'cha0spunk', display_name: 'cha0spunk' }, error: null }) }));
	const client = { auth: { getUser }, from: vi.fn(() => ({ select: () => ({ eq }) })) };
	return { getUser, eq, client, createSupabaseServerClientWithToken: vi.fn(async () => client) };
});

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClientWithToken: mocks.createSupabaseServerClientWithToken
}));

const get = (authorization) => new Request('https://example.com/api/profile', { headers: authorization ? { authorization } : {} });

describe('own profile', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });
	});

	it('finds the caller by token, not by username', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(get('Bearer t'));
		expect(response.status).toBe(200);
		expect(mocks.eq).toHaveBeenCalledWith('auth_user_id', 'auth-1');
		expect((await response.json()).user.username).toBe('cha0spunk');
	});

	it('401s without a token', async () => {
		const { GET } = await import('./route.js');
		expect((await GET(get())).status).toBe(401);
		expect(mocks.createSupabaseServerClientWithToken).not.toHaveBeenCalled();
	});

	it('401s with a token auth rejects', async () => {
		mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad jwt') });
		const { GET } = await import('./route.js');
		expect((await GET(get('Bearer nope'))).status).toBe(401);
	});
});
