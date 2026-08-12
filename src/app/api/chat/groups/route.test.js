import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	from: vi.fn(),
	userEq: vi.fn(),
	rpc: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		auth: { getUser: mocks.getUser },
		from: mocks.from,
		rpc: mocks.rpc
	}))
}));

function createUserQuery(result) {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.userEq,
		single: vi.fn().mockResolvedValue(result)
	};
	mocks.userEq.mockReturnValue(query);
	return query;
}

describe('GET /api/chat/groups', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.getUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
		mocks.from.mockImplementation((table) => {
			if (table === 'users') {
				return createUserQuery({
					data: { id: 'internal-user-id' },
					error: null
				});
			}

			throw new Error(`Unexpected table: ${table}`);
		});
		mocks.rpc.mockResolvedValue({
			data: [{ group_id: 'group-1', group_name: 'Friends' }],
			error: null
		});
	});

	it('loads groups with the internal user id resolved from auth_user_id', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/chat/groups'));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.groups).toEqual([{ group_id: 'group-1', group_name: 'Friends' }]);
		expect(mocks.userEq).toHaveBeenCalledWith('auth_user_id', 'auth-user-id');
		expect(mocks.rpc).toHaveBeenCalledWith('get_user_groups', {
			user_uuid: 'internal-user-id'
		});
	});

	it('returns 404 without calling the RPC when the internal profile is missing', async () => {
		mocks.from.mockImplementation((table) => {
			if (table === 'users') {
				return createUserQuery({ data: null, error: { message: 'not found' } });
			}

			throw new Error(`Unexpected table: ${table}`);
		});

		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/chat/groups'));

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'User not found' });
		expect(mocks.rpc).not.toHaveBeenCalled();
	});
});
