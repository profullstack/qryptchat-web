import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	serviceFrom: vi.fn(),
	userEq: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		auth: {
			getUser: mocks.authGetUser
		}
	}))
}));

vi.mock('@/lib/supabase/service-role.js', () => ({
	createServiceRoleClient: vi.fn(() => ({
		from: mocks.serviceFrom
	}))
}));

function createUsersQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.userEq,
		single: vi.fn().mockResolvedValue({
			data: { id: 'internal-user-id' },
			error: null
		})
	};
	mocks.userEq.mockReturnValue(query);
	return query;
}

describe('POST /api/chat/messages validation', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
	});

	it('returns 400 for malformed JSON before participant lookup', async () => {
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'conversation_participants') throw new Error('Participant query should not run');
			throw new Error(`Unexpected table: ${table}`);
		});

		const { POST } = await import('./route.js');
		const response = await POST({
			headers: new Headers({ cookie: 'sb-access-token=valid-token' }),
			json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
		expect(mocks.userEq).toHaveBeenCalledWith('auth_user_id', 'auth-user-id');
		expect(mocks.serviceFrom).toHaveBeenCalledTimes(1);
	});
});
