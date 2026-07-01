import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	from: vi.fn(),
	eq: vi.fn(),
	profile: {
		id: 'internal-user-id',
		auth_user_id: 'auth-user-id',
		username: 'alice'
	}
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		auth: {
			getUser: mocks.authGetUser
		},
		from: mocks.from
	}))
}));

function createProfileQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.eq,
		single: vi.fn().mockResolvedValue({
			data: mocks.profile,
			error: null
		})
	};
	mocks.eq.mockReturnValue(query);
	return query;
}

describe('GET /api/user/profile/[userId]', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
		mocks.from.mockImplementation((table) => {
			if (table === 'users') return createProfileQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('resolves async route params and returns the matching internal profile', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/user/profile/internal-user-id'), {
			params: Promise.resolve({ userId: 'internal-user-id' })
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.user.id).toBe('internal-user-id');
		expect(mocks.eq).toHaveBeenCalledWith('auth_user_id', 'auth-user-id');
	});

	it('allows the authenticated Supabase user id in the path', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/user/profile/auth-user-id'), {
			params: Promise.resolve({ userId: 'auth-user-id' })
		});

		expect(response.status).toBe(200);
	});

	it('rejects a path id for a different user', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/user/profile/other-user-id'), {
			params: Promise.resolve({ userId: 'other-user-id' })
		});
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body).toEqual({ error: 'Forbidden' });
	});
});
