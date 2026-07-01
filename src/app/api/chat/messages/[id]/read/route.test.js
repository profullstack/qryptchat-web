import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	serviceFrom: vi.fn(),
	rpc: vi.fn(),
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
		from: mocks.serviceFrom,
		rpc: mocks.rpc
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

describe('PATCH /api/chat/messages/[id]/read', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
		mocks.rpc.mockResolvedValue({ error: null });
	});

	it('marks the async path message id as read', async () => {
		const { PATCH } = await import('./route.js');
		const response = await PATCH(
			new Request('https://qrypt.chat/api/chat/messages/message-1/read', {
				method: 'PATCH',
				headers: { cookie: 'sb-access-token=valid-token' }
			}),
			{ params: Promise.resolve({ id: 'message-1' }) }
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(mocks.rpc).toHaveBeenCalledWith('fn_mark_message_read', {
			p_message_id: 'message-1',
			p_user_id: 'internal-user-id'
		});
	});

	it('rejects missing async path params before user lookup', async () => {
		const { PATCH } = await import('./route.js');
		const response = await PATCH(
			new Request('https://qrypt.chat/api/chat/messages/read', {
				method: 'PATCH',
				headers: { cookie: 'sb-access-token=valid-token' }
			}),
			{ params: Promise.resolve({}) }
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Missing message ID' });
		expect(mocks.serviceFrom).not.toHaveBeenCalled();
	});
});
