import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	serviceFrom: vi.fn(),
	rpc: vi.fn()
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

function cookieValue(token) {
	return `base64-${Buffer.from(JSON.stringify({ access_token: token })).toString('base64')}`;
}

function paddedCookieValue() {
	return 'base64-eyJhY2Nlc3NfdG9rZW4iOiJhYmMiLCJwYWRkaW5nIjoieCJ9==';
}

function createUsersQuery() {
	let selected = '';
	const query = {
		select: vi.fn((fields) => {
			selected = fields;
			return query;
		}),
		eq: vi.fn(() => query),
		single: vi.fn(() => {
			if (selected.includes('id, auth_user_id')) {
				return Promise.resolve({
					data: { id: 'internal-user-id', auth_user_id: 'auth-user-id', username: 'alice' },
					error: null
				});
			}
			return Promise.resolve({
				data: { auth_user_id: 'target-auth-user-id' },
				error: null
			});
		})
	};
	return query;
}

describe('public key cookie authentication', () => {
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
			if (table === 'users') return createUsersQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
		mocks.rpc.mockResolvedValue({ data: 'public-key', error: null });
	});

	it('accepts valid cookie headers without a space after semicolons', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/crypto/public-keys?user_id=target-user-id', {
				headers: {
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('access-token')};session=ignored`
				}
			})
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ public_key: 'public-key', user_id: 'target-user-id' });
		expect(mocks.authGetUser).toHaveBeenCalledWith('access-token');
	});

	it('preserves equals padding in base64 auth cookies', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/crypto/public-keys?user_id=target-user-id', {
				headers: {
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${paddedCookieValue()}`
				}
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.authGetUser).toHaveBeenCalledWith('abc');
	});

	it('rejects non-string public keys before upsert RPC work', async () => {
		const { PUT } = await import('./route.js');
		const response = await PUT(
			new Request('https://qrypt.chat/api/crypto/public-keys', {
				method: 'PUT',
				headers: {
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('access-token')}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					public_key: { key: 'ml-kem-public-key' }
				})
			})
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Missing public_key' });
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it('rejects oversized public key batches before lookup work', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(
			new Request('https://qrypt.chat/api/crypto/public-keys', {
				method: 'POST',
				headers: {
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('access-token')}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					user_ids: Array.from({ length: 101 }, (_, index) => `user-${index}`)
				})
			})
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain('at most 100');
		expect(mocks.serviceFrom).toHaveBeenCalledTimes(1);
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it('rejects malformed and invalid public key batches', async () => {
		const { POST } = await import('./route.js');
		const headers = {
			cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('access-token')}`,
			'content-type': 'application/json'
		};
		const malformedResponse = await POST(
			new Request('https://qrypt.chat/api/crypto/public-keys', {
				method: 'POST',
				headers,
				body: '{"user_ids":'
			})
		);
		const invalidResponse = await POST(
			new Request('https://qrypt.chat/api/crypto/public-keys', {
				method: 'POST',
				headers,
				body: JSON.stringify({ user_ids: ['valid-id', 42] })
			})
		);

		expect(malformedResponse.status).toBe(400);
		expect(invalidResponse.status).toBe(400);
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it('trims and deduplicates public key batch ids', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(
			new Request('https://qrypt.chat/api/crypto/public-keys', {
				method: 'POST',
				headers: {
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('access-token')}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ user_ids: [' user-one ', 'user-one', 'user-two'] })
			})
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			public_keys: {
				'user-one': 'public-key',
				'user-two': 'public-key'
			}
		});
		expect(mocks.serviceFrom).toHaveBeenCalledTimes(3);
		expect(mocks.rpc).toHaveBeenCalledTimes(2);
	});
});
