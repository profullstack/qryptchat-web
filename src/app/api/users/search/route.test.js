import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	from: vi.fn(),
	select: vi.fn(),
	or: vi.fn(),
	neq: vi.fn(),
	limit: vi.fn(),
	createSupabaseServerClient: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: mocks.createSupabaseServerClient
}));

describe('user search', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.getUser.mockResolvedValue({
			data: { user: { id: 'auth-user-1' } },
			error: null
		});
		mocks.from.mockReturnValue({ select: mocks.select });
		mocks.select.mockReturnValue({ or: mocks.or });
		mocks.or.mockReturnValue({ neq: mocks.neq });
		mocks.neq.mockReturnValue({ limit: mocks.limit });
		mocks.limit.mockResolvedValue({ data: [], error: null });
		mocks.createSupabaseServerClient.mockResolvedValue({
			auth: { getUser: mocks.getUser },
			from: mocks.from
		});
	});

	it('excludes the authenticated user with the auth_user_id column', async () => {
		const { GET } = await import('./route.js');

		const response = await GET(new Request('https://example.com/api/users/search?q=alice'));

		expect(response.status).toBe(200);
		expect(mocks.neq).toHaveBeenCalledWith('auth_user_id', 'auth-user-1');
	});
});
