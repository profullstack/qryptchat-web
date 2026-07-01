import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	eq: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		from: mocks.from
	}))
}));

function createUsersQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.eq,
		single: vi.fn().mockResolvedValue({
			data: {
				id: 'user-1',
				username: 'alice',
				display_name: 'Alice',
				avatar_url: null,
				bio: null,
				unique_identifier: 'qryptchatA1B2C3D4'
			},
			error: null
		})
	};
	mocks.eq.mockReturnValue(query);
	return query;
}

describe('GET /api/users/by-username/[username]', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.from.mockReturnValue(createUsersQuery());
	});

	it('resolves async route params before filtering by username', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/users/by-username/Alice'), {
			params: Promise.resolve({ username: 'Alice' })
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.user.username).toBe('alice');
		expect(mocks.eq).toHaveBeenCalledWith('username', 'alice');
	});

	it('rejects missing usernames before database work', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/users/by-username/'), {
			params: Promise.resolve({})
		});

		expect(response.status).toBe(400);
		expect(mocks.from).not.toHaveBeenCalled();
	});
});
