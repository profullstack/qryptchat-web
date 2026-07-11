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
});
