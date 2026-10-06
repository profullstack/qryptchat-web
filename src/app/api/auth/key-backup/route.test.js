import { supabaseAuthCookieName } from '@/lib/supabase/auth-cookie.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	serviceFrom: vi.fn(),
	checkPin: vi.fn(),
	resolveUser: vi.fn()
}));

vi.mock('@/lib/auth/backup-pin.js', async (importOriginal) => ({
	...(await importOriginal()),
	checkPin: mocks.checkPin,
	resolveInternalUserId: mocks.resolveUser
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

function createBackupQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		single: vi.fn(() =>
			Promise.resolve({
				data: {
					encrypted_keys: '{"version":1}',
					created_at: '2026-07-11T00:00:00.000Z',
					updated_at: '2026-07-11T00:00:00.000Z'
				},
				error: null
			})
		)
	};
	return query;
}

function createUpsertQuery() {
	const query = {
		upsert: vi.fn(() => query),
		select: vi.fn(() => query),
		single: vi.fn(() =>
			Promise.resolve({
				data: {
					id: 'backup-id',
					created_at: '2026-07-11T00:00:00.000Z',
					updated_at: '2026-07-11T00:00:00.000Z'
				},
				error: null
			})
		)
	};
	return query;
}

describe('key backup cookie authentication', () => {
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
			if (table === 'key_backups') return createBackupQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('accepts valid cookie headers without a space after semicolons', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/key-backup', {
				headers: {
					cookie: `${supabaseAuthCookieName()}=${cookieValue('access-token')};session=ignored`
				}
			})
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		// GET only says a backup exists; the encrypted keys need the PIN (POST).
		expect(body).toEqual({
			backup: {
				created_at: '2026-07-11T00:00:00.000Z',
				updated_at: '2026-07-11T00:00:00.000Z'
			}
		});
		expect(mocks.authGetUser).toHaveBeenCalledWith('access-token');
	});

	it('preserves equals padding in base64 auth cookies', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/key-backup', {
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
			new Request('https://qrypt.chat/api/auth/key-backup', {
				headers: {
					authorization: 'bearer   access-token  '
				}
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.authGetUser).toHaveBeenCalledWith('access-token');
	});

	it('ignores an empty bearer header and falls back to cookies', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/auth/key-backup', {
				headers: {
					authorization: 'Bearer   ',
					cookie: `${supabaseAuthCookieName()}=${cookieValue('cookie-token')}`
				}
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.authGetUser).toHaveBeenCalledWith('cookie-token');
	});

	it('rejects encrypted_keys JSON that is not an object export', async () => {
		const { PUT } = await import('./route.js');
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'key_backups') return createUpsertQuery();
			throw new Error(`Unexpected table: ${table}`);
		});

		const response = await PUT(
			new Request('https://qrypt.chat/api/auth/key-backup', {
				method: 'PUT',
				headers: {
					authorization: 'Bearer access-token',
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					encrypted_keys: '"not-a-backup-export"'
				})
			})
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'encrypted_keys must be a JSON object string' });
		expect(mocks.serviceFrom).not.toHaveBeenCalled();
	});
});

describe('key backup restore is gated on the PIN', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
		mocks.authGetUser.mockResolvedValue({ data: { user: { id: 'auth-user-id' } }, error: null });
		mocks.resolveUser.mockResolvedValue({ userId: 'user-id' });
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'key_backups') return createBackupQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	const restore = (pin) =>
		new Request('https://qrypt.chat/api/auth/key-backup', {
			method: 'POST',
			headers: { authorization: 'Bearer access-token', 'content-type': 'application/json' },
			body: JSON.stringify({ pin })
		});

	it('returns the encrypted keys for the right PIN', async () => {
		mocks.checkPin.mockResolvedValue({ status: 'ok' });
		const { POST } = await import('./route.js');
		const response = await POST(restore('4821'));
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.backup.encrypted_keys).toBe('{"version":1}');
		expect(body.legacy).toBe(false);
		expect(mocks.checkPin).toHaveBeenCalledWith(expect.anything(), 'user-id', '4821');
	});

	it('withholds the keys for a wrong PIN and says how many tries are left', async () => {
		mocks.checkPin.mockResolvedValue({ status: 'wrong', remaining: 3 });
		const { POST } = await import('./route.js');
		const response = await POST(restore('0000'));
		const body = await response.json();
		expect(response.status).toBe(403);
		expect(body).toEqual({ error: 'Wrong PIN', code: 'PIN_WRONG', remaining: 3 });
	});

	it('answers 429 with Retry-After while locked', async () => {
		mocks.checkPin.mockResolvedValue({ status: 'locked', retryAfter: 600 });
		const { POST } = await import('./route.js');
		const response = await POST(restore('4821'));
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('600');
		expect((await response.json()).encrypted_keys).toBeUndefined();
	});

	it('flags a backup whose PIN the server cannot verify as legacy', async () => {
		mocks.checkPin.mockResolvedValue({ status: 'unset' });
		const { POST } = await import('./route.js');
		const body = await (await POST(restore('4821'))).json();
		expect(body.legacy).toBe(true);
	});

	it('refuses a backup write with the wrong PIN', async () => {
		mocks.checkPin.mockResolvedValue({ status: 'wrong', remaining: 4 });
		const { PUT } = await import('./route.js');
		const response = await PUT(
			new Request('https://qrypt.chat/api/auth/key-backup', {
				method: 'PUT',
				headers: { authorization: 'Bearer access-token', 'content-type': 'application/json' },
				body: JSON.stringify({ encrypted_keys: '{"version":1}', pin: '0000' })
			})
		);
		expect(response.status).toBe(403);
	});
});
