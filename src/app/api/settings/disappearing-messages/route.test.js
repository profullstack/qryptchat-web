import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	createServiceRoleClient: vi.fn(),
	from: vi.fn(),
	profileEq: vi.fn(),
	updateEq: vi.fn()
}));

vi.mock('@/lib/supabase/service-role.js', () => ({
	createServiceRoleClient: mocks.createServiceRoleClient
}));

function request(method, body) {
	return new Request('https://qrypt.chat/api/settings/disappearing-messages', {
		method,
		headers: {
			authorization: 'Bearer valid-token',
			...(body ? { 'content-type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
}

function profileQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.profileEq,
		single: vi.fn().mockResolvedValue({
			data: { default_message_retention_days: 7 },
			error: null
		})
	};
	mocks.profileEq.mockReturnValue(query);
	return query;
}

function updateQuery() {
	const query = {
		update: vi.fn(() => query),
		eq: mocks.updateEq
	};
	mocks.updateEq.mockResolvedValue({ error: null });
	return query;
}

describe('settings disappearing messages authentication', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
		mocks.createServiceRoleClient.mockReturnValue({
			auth: { getUser: mocks.authGetUser },
			from: mocks.from
		});
		mocks.from.mockImplementation((table) => {
			if (table !== 'users') throw new Error(`Unexpected table: ${table}`);
			return profileQuery();
		});
	});

	it('initializes the service client before authenticating GET requests', async () => {
		const { GET } = await import('./route.js');

		const response = await GET(request('GET'));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.default_message_retention_days).toBe(7);
		expect(mocks.authGetUser).toHaveBeenCalledWith('valid-token');
		expect(mocks.profileEq).toHaveBeenCalledWith('auth_user_id', 'auth-user-id');
	});

	it('initializes the service client before authenticating PUT requests', async () => {
		mocks.from.mockImplementation((table) => {
			if (table !== 'users') throw new Error(`Unexpected table: ${table}`);
			return updateQuery();
		});
		const { PUT } = await import('./route.js');

		const response = await PUT(request('PUT', { default_message_retention_days: 3 }));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(mocks.authGetUser).toHaveBeenCalledWith('valid-token');
		expect(mocks.updateEq).toHaveBeenCalledWith('auth_user_id', 'auth-user-id');
	});
});
