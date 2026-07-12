import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	serviceFrom: vi.fn(),
	serviceRpc: vi.fn()
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
		rpc: mocks.serviceRpc
	}))
}));

function cookieValue(token) {
	return `base64-${Buffer.from(JSON.stringify({ access_token: token })).toString('base64')}`;
}

function deleteRequest(headers) {
	return new Request('https://qrypt.chat/api/user/nuclear-delete', {
		method: 'DELETE',
		headers,
		body: JSON.stringify({ confirmation: 'DELETE_ALL_MY_DATA' })
	});
}

function createUserQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		single: vi.fn(() =>
			Promise.resolve({
				data: {
					id: 'internal-user-id',
					phone_number: '+15551234567',
					username: 'cipher-user'
				},
				error: null
			})
		)
	};
	return query;
}

describe('DELETE /api/user/nuclear-delete bearer authentication', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUserQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
		mocks.serviceRpc.mockResolvedValue({
			data: { deleted_messages: 1, deleted_keys: 1 },
			error: null
		});
	});

	it('normalizes bearer scheme casing and extra spaces', async () => {
		const { DELETE } = await import('./route.js');
		const response = await DELETE(
			deleteRequest({
				authorization: 'bearer   access-token  ',
				'content-type': 'application/json'
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.authGetUser).toHaveBeenCalledWith('access-token');
		expect(mocks.serviceRpc).toHaveBeenCalledWith('delete_encrypted_data_only', {
			authenticated_user_id: 'internal-user-id',
			target_user_id: 'internal-user-id'
		});
	});

	it('ignores an empty bearer header and falls back to cookies', async () => {
		const { DELETE } = await import('./route.js');
		const response = await DELETE(
			deleteRequest({
				authorization: 'Bearer   ',
				cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('cookie-token')}`,
				'content-type': 'application/json'
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.authGetUser).toHaveBeenCalledWith('cookie-token');
	});
});
