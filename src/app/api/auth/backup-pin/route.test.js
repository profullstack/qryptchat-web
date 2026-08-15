import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHash } from 'node:crypto';

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
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('access-token')};session=ignored`
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
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${paddedCookieValue()}`
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
					cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${cookieValue('cookie-token')}`
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

	it('stores a salted scrypt hash rather than an unsalted SHA-256 digest', async () => {
		const { POST } = await import('./route.js');
		const pin = '123456';
		const response = await POST({
			headers: new Headers({ authorization: 'Bearer access-token' }),
			json: vi.fn().mockResolvedValue({ pin })
		});

		expect(response.status).toBe(200);
		expect(mocks.pinUpsert).toHaveBeenCalledTimes(1);

		const [record] = mocks.pinUpsert.mock.calls[0];
		expect(record.user_id).toBe('internal-user-id');
		expect(record.algorithm).toMatch(/^scrypt-/);

		// A salt is present and actually mixed in: the stored hash must not be the
		// bare SHA-256 of the PIN, which is what GHSA-jpfm-vrpc-p6rr was about.
		expect(record.pin_salt).toMatch(/^[0-9a-f]{32}$/);
		const unsaltedSha256 = createHash('sha256').update(pin).digest('hex');
		expect(record.pin_hash).not.toBe(unsaltedSha256);
		expect(record.pin_hash).toMatch(/^[0-9a-f]{128}$/);
	});

	it('derives a different hash per user for the same PIN', async () => {
		const { POST } = await import('./route.js');
		const request = () => ({
			headers: new Headers({ authorization: 'Bearer access-token' }),
			json: vi.fn().mockResolvedValue({ pin: '123456' })
		});

		await POST(request());
		await POST(request());

		const [first] = mocks.pinUpsert.mock.calls[0];
		const [second] = mocks.pinUpsert.mock.calls[1];
		expect(first.pin_salt).not.toBe(second.pin_salt);
		expect(first.pin_hash).not.toBe(second.pin_hash);
	});

	it('returns 400 for malformed JSON instead of a generic 500', async () => {
		const { POST } = await import('./route.js');
		const response = await POST({
			headers: new Headers({ authorization: 'Bearer access-token' }),
			json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
		expect(mocks.serviceFrom).not.toHaveBeenCalled();
	});
});
