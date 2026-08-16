import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	from: vi.fn(),
	select: vi.fn(),
	or: vi.fn(),
	neq: vi.fn(),
	limit: vi.fn(),
	createSupabaseServerClient: vi.fn(),
	getServiceRoleClient: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: mocks.createSupabaseServerClient
}));

vi.mock('@/lib/supabase/service-role.js', () => ({
	getServiceRoleClient: mocks.getServiceRoleClient
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
			auth: { getUser: mocks.getUser }
		});
		// The directory lookup has to outrun the narrowed `users` SELECT policy, so it
		// runs as the service role once the session has been verified.
		mocks.getServiceRoleClient.mockReturnValue({ from: mocks.from });
	});

	it('excludes the authenticated user with the auth_user_id column', async () => {
		const { GET } = await import('./route.js');

		const response = await GET(new Request('https://example.com/api/users/search?q=alice'));

		expect(response.status).toBe(200);
		expect(mocks.neq).toHaveBeenCalledWith('auth_user_id', 'auth-user-1');
	});

	// A one-character query matched against phone_number turned this endpoint into an
	// existence oracle for registered numbers.
	it('only matches phone numbers once the query is long enough to not be an oracle', async () => {
		const { GET } = await import('./route.js');

		await GET(new Request('https://example.com/api/users/search?q=555'));
		expect(mocks.or.mock.calls[0][0]).not.toContain('phone_number');

		vi.clearAllMocks();
		mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
		mocks.from.mockReturnValue({ select: mocks.select });
		mocks.select.mockReturnValue({ or: mocks.or });
		mocks.or.mockReturnValue({ neq: mocks.neq });
		mocks.neq.mockReturnValue({ limit: mocks.limit });
		mocks.limit.mockResolvedValue({ data: [], error: null });
		mocks.getServiceRoleClient.mockReturnValue({ from: mocks.from });

		await GET(new Request('https://example.com/api/users/search?q=5551234'));
		expect(mocks.or.mock.calls[0][0]).toContain('phone_number');
	});

	it('does not query users when sanitized search text is empty', async () => {
		const { GET } = await import('./route.js');

		const response = await GET(new Request('https://example.com/api/users/search?q=...'));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ users: [] });
		expect(mocks.from).not.toHaveBeenCalled();
	});
});
