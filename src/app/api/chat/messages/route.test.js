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

	it('rejects encrypted_contents arrays before participant lookup', async () => {
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'conversation_participants') throw new Error('Participant query should not run');
			throw new Error(`Unexpected table: ${table}`);
		});

		const { POST } = await import('./route.js');
		const response = await POST(
			new Request('https://qrypt.chat/api/chat/messages', {
				method: 'POST',
				headers: {
					cookie: 'sb-access-token=valid-token',
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					conversation_id: 'conversation-1',
					encrypted_contents: ['not-a-user-map']
				})
			})
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('encrypted_contents must be an object with user_id -> encrypted_content mappings');
		expect(mocks.userEq).toHaveBeenCalledWith('auth_user_id', 'auth-user-id');
		expect(mocks.serviceFrom).toHaveBeenCalledTimes(1);
	});
});
