import { supabaseAuthCookieName } from '@/lib/supabase/auth-cookie.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	serviceFrom: vi.fn(),
	pinUpsert: vi.fn()
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

function paddedCookieValue() {
	return 'base64-eyJhY2Nlc3NfdG9rZW4iOiJhYmMiLCJwYWRkaW5nIjoieCJ9==';
}

function createUsersQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		single: vi.fn(() =>
			Promise.resolve({
				data: { id: 'internal-user-id' },
				error: null
			})
		)
	};
	return query;
}

function createBackupPinsQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		maybeSingle: vi.fn(() =>
			Promise.resolve({
				data: { user_id: 'internal-user-id' },
				error: null
			})
		),
		upsert: mocks.pinUpsert
	};
	return query;
}

describe('backup PIN cookie authentication', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
		mocks.pinUpsert.mockResolvedValue({ error: null });
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'user_backup_pins') return createBackupPinsQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('accepts valid cookie headers without a space after semicolons', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/backup-pin', {
				headers: {
					cookie: `${supabaseAuthCookieName()}=${cookieValue('access-token')};session=ignored`
				}
			})
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ hasPin: true });
		expect(mocks.authGetUser).toHaveBeenCalledWith('access-token');
	});

	it('preserves equals padding in base64 auth cookies', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/backup-pin', {
				headers: {
					cookie: `${supabaseAuthCookieName()}=${paddedCookieValue()}`
				}
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.authGetUser).toHaveBeenCalledWith('abc');
	});

	it('normalizes bearer scheme casing and extra spaces', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/backup-pin', {
				headers: {
					authorization: 'bearer   access-token  '
				}
			})
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ hasPin: true });
		expect(mocks.authGetUser).toHaveBeenCalledWith('access-token');
	});

	it('ignores an empty bearer header and falls back to cookies', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/backup-pin', {
				headers: {
					authorization: 'Bearer   ',
					cookie: `${supabaseAuthCookieName()}=${cookieValue('cookie-token')}`
				}
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.authGetUser).toHaveBeenCalledWith('cookie-token');
	});

	it('reads the has-pin flag from the service-role-only table, not from users', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/backup-pin', {
				headers: { authorization: 'Bearer access-token' }
			})
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ hasPin: true });
		expect(mocks.serviceFrom).toHaveBeenCalledWith('user_backup_pins');
	});

	it('no longer sets PINs: backups are sealed with a passphrase now', async () => {
		const { POST } = await import('./route.js');
		const response = await POST({
			headers: new Headers({ authorization: 'Bearer access-token' }),
			json: vi.fn().mockResolvedValue({ pin: '4821' })
		});
		expect(response.status).toBe(410);
		expect((await response.json()).code).toBe('PIN_RETIRED');
		expect(mocks.pinUpsert).not.toHaveBeenCalled();
	});

	it('still requires a session to say so', async () => {
		mocks.authGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
		const { POST } = await import('./route.js');
		const response = await POST(new Request('https://qrypt.chat/api/auth/backup-pin', { method: 'POST', body: '{}' }));
		expect(response.status).toBe(401);
	});
});
