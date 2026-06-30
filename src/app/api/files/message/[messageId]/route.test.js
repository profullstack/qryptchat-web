import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	from: vi.fn(),
	usersEq: vi.fn(),
	filesEq: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		auth: {
			getUser: mocks.authGetUser
		},
		from: mocks.from
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
		eq: mocks.filesEq
	};
	mocks.filesEq.mockImplementation((field) => {
		if (field === 'messages.conversations.conversation_participants.user_id') {
			return Promise.resolve({ data: [], error: null });
		}
		return query;
	});
	return query;
}

describe('GET /api/files/message/[messageId]', () => {
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
	});

	it('resolves async route params before filtering by message id', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/files/message/message-1'), {
			params: Promise.resolve({ messageId: 'message-1' })
		});

		expect(response.status).toBe(200);
		expect(mocks.filesEq).toHaveBeenCalledWith('message_id', 'message-1');
	});

	it('rejects missing message ids before auth work', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/files/message/'), {
			params: Promise.resolve({})
		});

		expect(response.status).toBe(400);
		expect(mocks.authGetUser).not.toHaveBeenCalled();
	});
});
