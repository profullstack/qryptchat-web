import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	from: vi.fn(),
	usersEq: vi.fn(),
	messagesEq: vi.fn(),
	deliveriesIn: vi.fn()
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

function createMessagesQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.messagesEq
	};
	mocks.messagesEq.mockReturnValue(query);
	return query;
}

function createDeliveriesQuery() {
	const query = {
		update: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		in: mocks.deliveriesIn
	};
	mocks.deliveriesIn.mockReturnValue({ error: null });
	return query;
}

describe('POST /api/chat/conversations/[id]/mark-read', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});

		mocks.from.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'messages') return createMessagesQuery();
			if (table === 'deliveries') return createDeliveriesQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('resolves async route params before filtering messages', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(new Request('https://qrypt.chat/api/chat/conversations/conversation-1/mark-read'), {
			params: Promise.resolve({ id: 'conversation-1' })
		});

		expect(response.status).toBe(200);
		expect(mocks.messagesEq).toHaveBeenCalledWith('conversation_id', 'conversation-1');
		expect(mocks.deliveriesIn).toHaveBeenCalledWith('message_id', expect.any(Object));
	});

	it('rejects requests without a conversation id', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(new Request('https://qrypt.chat/api/chat/conversations//mark-read'), {
			params: Promise.resolve({})
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Conversation ID is required' });
		expect(mocks.authGetUser).not.toHaveBeenCalled();
	});
});
