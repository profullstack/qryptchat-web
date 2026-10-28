import { supabaseAuthCookieName } from '@/lib/supabase/auth-cookie.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRecoveryKey, sealKeys } from '@/lib/crypto/key-backup-seal.js';

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

function createBackupQuery(row = {}) {
	const data = {
		encrypted_keys: '{"version":1}',
		created_at: '2026-07-11T00:00:00.000Z',
		updated_at: '2026-07-11T00:00:00.000Z',
		seal_version: 1,
		...row
	};
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		single: vi.fn(() => Promise.resolve({ data, error: null })),
		maybeSingle: vi.fn(() => Promise.resolve({ data: row === null ? null : { seal_version: data.seal_version }, error: null }))
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
				updated_at: '2026-07-11T00:00:00.000Z',
				seal_version: 1
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

describe('legacy PIN backup restore is gated on the PIN', () => {
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
		// still a PIN backup: the client must re-seal it with a passphrase
		expect(body.legacy).toBe(true);
		expect(body.pinVerified).toBe(true);
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
});

const USER_ID = 'auth-user-id';

async function sealedBackup() {
	const keys = new TextEncoder().encode('{"keys1024":{"publicKey":"pk","privateKey":"sk"}}');
	const envelope = await sealKeys(keys, {
		passphrase: 'correct horse battery staple',
		recoveryKey: generateRecoveryKey(),
		userId: USER_ID
	});
	return JSON.stringify(envelope);
}

const put = (body) =>
	new Request('https://qrypt.chat/api/auth/key-backup', {
		method: 'PUT',
		headers: { authorization: 'Bearer access-token', 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});

const post = (body = {}) =>
	new Request('https://qrypt.chat/api/auth/key-backup', {
		method: 'POST',
		headers: { authorization: 'Bearer access-token', 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});

describe('seal v2 key backups', () => {
	let upserts;
	let pinDeletes;
	let existing;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		delete process.env.LEGACY_KEY_MIGRATION;
		process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
		mocks.authGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
		mocks.resolveUser.mockResolvedValue({ userId: 'user-id' });
		upserts = [];
		pinDeletes = [];
		existing = null;
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'key_backups') {
				const q = existing === undefined ? createBackupQuery(null) : createBackupQuery(existing ?? {});
				if (existing === null) q.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
				q.upsert = vi.fn((row) => {
					upserts.push(row);
					return q;
				});
				q.single = vi.fn(() =>
					Promise.resolve({
						data: existing ?? { id: 'backup-id', created_at: 'c', updated_at: 'u' },
						error: null
					})
				);
				return q;
			}
			if (table === 'user_backup_pins') {
				const q = {
					delete: vi.fn(() => q),
					eq: vi.fn((col, val) => {
						pinDeletes.push(val);
						return Promise.resolve({ error: null });
					})
				};
				return q;
			}
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	afterEach(() => {
		delete process.env.LEGACY_KEY_MIGRATION;
	});

	it('refuses to store a PIN-sealed (legacy format) backup', async () => {
		const { PUT } = await import('./route.js');
		const legacy = JSON.stringify({ version: '3.0', algorithm: 'ChaCha20-Poly1305-HKDF', encryptedKeys: 'x' });
		const response = await PUT(put({ encrypted_keys: legacy, pin: '4821' }));
		expect(response.status).toBe(400);
		expect((await response.json()).code).toBe('SEAL_REQUIRED');
		expect(mocks.serviceFrom).not.toHaveBeenCalled();
	});

	it('stores a sealed backup as seal_version 2 and retires the PIN hash', async () => {
		const { PUT } = await import('./route.js');
		const encrypted_keys = await sealedBackup();
		const response = await PUT(put({ encrypted_keys }));
		expect(response.status).toBe(200);
		expect((await response.json()).seal_version).toBe(2);
		expect(upserts).toHaveLength(1);
		expect(upserts[0]).toMatchObject({ user_id: USER_ID, encrypted_keys, seal_version: 2 });
		expect(pinDeletes).toEqual(['user-id']);
		expect(mocks.checkPin).not.toHaveBeenCalled();
	});

	it('needs the old PIN to replace a PIN backup the server can verify', async () => {
		existing = { seal_version: 1 };
		mocks.checkPin.mockResolvedValue({ status: 'required' });
		const { PUT } = await import('./route.js');
		const response = await PUT(put({ encrypted_keys: await sealedBackup() }));
		expect(response.status).toBe(403);
		expect((await response.json()).code).toBe('PIN_REQUIRED');
		expect(upserts).toHaveLength(0);
		expect(pinDeletes).toHaveLength(0);
	});

	it('upgrades a PIN backup in place once the PIN checks out', async () => {
		existing = { seal_version: 1 };
		mocks.checkPin.mockResolvedValue({ status: 'ok' });
		const { PUT } = await import('./route.js');
		const response = await PUT(put({ encrypted_keys: await sealedBackup(), pin: '4821' }));
		expect(response.status).toBe(200);
		expect(upserts[0].seal_version).toBe(2);
		expect(pinDeletes).toEqual(['user-id']);
	});

	it('returns a sealed backup to its owner without any PIN (it opens only with the passphrase)', async () => {
		const encrypted_keys = await sealedBackup();
		existing = { encrypted_keys, seal_version: 2, created_at: 'c', updated_at: 'u' };
		const { POST } = await import('./route.js');
		const response = await POST(post());
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.backup.encrypted_keys).toBe(encrypted_keys);
		expect(body.backup.seal_version).toBe(2);
		expect(body.user_id).toBe(USER_ID);
		expect(body.legacy).toBe(false);
		expect(mocks.checkPin).not.toHaveBeenCalled();
	});

	it('stops serving PIN backups after the cutoff (LEGACY_KEY_MIGRATION=off)', async () => {
		process.env.LEGACY_KEY_MIGRATION = 'off';
		existing = { seal_version: 1 };
		mocks.checkPin.mockResolvedValue({ status: 'ok' });
		const { POST } = await import('./route.js');
		const response = await POST(post({ pin: '4821' }));
		const body = await response.json();
		expect(response.status).toBe(410);
		expect(body.code).toBe('LEGACY_BACKUP_DISABLED');
		expect(body.backup).toBeUndefined();
		expect(mocks.checkPin).not.toHaveBeenCalled();
	});
});

describe('no server-held key', () => {
	it('the backup route and the seal module read no secret from the environment', () => {
		const route = readFileSync(resolve('src/app/api/auth/key-backup/route.js'), 'utf8');
		const seal = readFileSync(resolve('src/lib/crypto/key-backup-seal.js'), 'utf8');
		const envNames = (src) => [...src.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
		expect(envNames(seal)).toEqual([]);
		expect(new Set(envNames(route))).toEqual(new Set(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']));
	});
});
