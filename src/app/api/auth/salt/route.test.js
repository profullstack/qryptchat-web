import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	serviceFrom: vi.fn(),
	updateUser: vi.fn(() => ({
		eq: vi.fn(() => Promise.resolve({ error: null }))
	}))
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

function cookieValue(token) {
	return `base64-${Buffer.from(JSON.stringify({ access_token: token })).toString('base64')}`;
}

function createUsersQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		update: mocks.updateUser,
		single: vi.fn(() =>
			Promise.resolve({
				data: { salt: 'stored-salt' },
				error: null
			})
		)
	};
	return query;
}

function postSaltRequest(body, headers = { authorization: 'Bearer access-token' }) {
	return new Request('https://qrypt.chat/api/auth/salt', {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
}

describe('salt cookie authentication', () => {
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
	});

	it('accepts valid cookie headers without a space after semicolons', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/salt', {
				headers: {
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('access-token')};session=ignored`
				}
			})
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ salt: 'stored-salt' });
		expect(mocks.authGetUser).toHaveBeenCalledWith('access-token');
	});

	it('normalizes bearer scheme casing and extra spaces', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/salt', {
				headers: {
					authorization: 'bearer   access-token  '
				}
			})
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ salt: 'stored-salt' });
		expect(mocks.authGetUser).toHaveBeenCalledWith('access-token');
	});

	it('ignores an empty bearer header and falls back to cookies', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/salt', {
				headers: {
					authorization: 'Bearer   ',
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('cookie-token')}`
				}
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.authGetUser).toHaveBeenCalledWith('cookie-token');
	});

	it('rejects non-string salts before querying the user record', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(postSaltRequest({ salt: { value: 'abc' } }));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Missing salt');
		expect(mocks.serviceFrom).not.toHaveBeenCalled();
	});

	it('trims new salts before storing and returning them', async () => {
		mocks.serviceFrom.mockImplementation((table) => {
			if (table !== 'users') throw new Error(`Unexpected table: ${table}`);
			const query = createUsersQuery();
			query.single.mockResolvedValueOnce({
				data: { salt: null, phone_number: '+15551234567' },
				error: null
			});
			return query;
		});

		const { POST } = await import('./route.js');
		const response = await POST(postSaltRequest({ salt: '  client-salt  ' }));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ salt: 'client-salt', existing: false });
		expect(mocks.updateUser).toHaveBeenCalledWith({ salt: 'client-salt' });
	});
});
