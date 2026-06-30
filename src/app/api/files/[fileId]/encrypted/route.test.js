import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	from: vi.fn(),
	storageFrom: vi.fn(),
	download: vi.fn(),
	usersEq: vi.fn(),
	filesEq: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		auth: {
			getUser: mocks.authGetUser
		},
		from: mocks.from,
		storage: {
			from: mocks.storageFrom
		}
	}))
}));

function createUsersQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.usersEq,
		single: vi.fn().mockResolvedValue({
			data: { id: 'internal-user-id' },
			error: null
		})
	};
	mocks.usersEq.mockReturnValue(query);
	return query;
}

function createFilesQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.filesEq,
		single: vi.fn().mockResolvedValue({
			data: {
				id: 'file-1',
				message_id: 'message-1',
				storage_path: 'encrypted/file-1',
				encrypted_metadata: {},
				created_at: '2026-06-30T00:00:00Z'
			},
			error: null
		})
	};
	mocks.filesEq.mockReturnValue(query);
	return query;
}

describe('GET /api/files/[fileId]/encrypted', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.spyOn(console, 'log').mockImplementation(() => {});

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
		mocks.from.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'encrypted_files') return createFilesQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
		mocks.download.mockResolvedValue({
			data: { text: vi.fn().mockResolvedValue('{"internal-user-id":"ciphertext"}') },
			error: null
		});
		mocks.storageFrom.mockReturnValue({
			download: mocks.download
		});
	});

	it('resolves async route params before filtering by file id', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/files/file-1/encrypted'), {
			params: Promise.resolve({ fileId: 'file-1' })
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.file.id).toBe('file-1');
		expect(mocks.filesEq).toHaveBeenCalledWith('id', 'file-1');
		expect(mocks.download).toHaveBeenCalledWith('encrypted/file-1');
	});

	it('rejects missing file ids before auth work', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/files//encrypted'), {
			params: Promise.resolve({})
		});

		expect(response.status).toBe(400);
		expect(mocks.authGetUser).not.toHaveBeenCalled();
	});
});
