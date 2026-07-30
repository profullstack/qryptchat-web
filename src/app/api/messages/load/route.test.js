import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockSupabase: {
		from: vi.fn(),
		rpc: vi.fn()
	},
	mockJoinRoom: vi.fn(),
	userEq: vi.fn(),
	participantEq: vi.fn(),
	messageConversationEq: vi.fn()
}));

vi.mock('@/lib/api/middleware/auth.js', () => ({
	withAuth: (handler) => (request, context) =>
		handler({
			request,
			locals: {
				supabase: mocks.mockSupabase,
				user: { id: 'auth-user-id' }
			},
			context
		})
}));

vi.mock('@/lib/api/sse-manager.js', () => ({
	sseManager: {
		joinRoom: mocks.mockJoinRoom
	}
}));

function createUserQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.userEq,
		single: vi.fn().mockResolvedValue({
			data: { id: 'internal-user-id' },
			error: null
		})
	};
	mocks.userEq.mockReturnValue(query);
	return query;
}

function createParticipantQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.participantEq,
		single: vi.fn().mockResolvedValue({
			data: { id: 'participant-row' },
			error: null
		})
	};
	mocks.participantEq.mockReturnValue(query);
	return query;
}

function createMessagesQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		order: vi.fn(() => query),
		limit: vi.fn().mockResolvedValue({
			data: [],
			error: null
		})
	};
	query.eq.mockImplementation((column, value) => {
		if (column === 'conversation_id') {
			mocks.messageConversationEq(column, value);
		}
		return query;
	});
	return query;
}

describe('POST /api/messages/load validation', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
		mocks.mockSupabase.from.mockImplementation((table) => {
			if (table === 'users') return createUserQuery();
			if (table === 'conversation_participants') return createParticipantQuery();
			if (table === 'messages') return createMessagesQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('rejects blank conversation ids before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue({
				conversationId: '   '
			})
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Missing conversationId');
		expect(mocks.mockSupabase.from).not.toHaveBeenCalled();
		expect(mocks.mockJoinRoom).not.toHaveBeenCalled();
	});

	it('rejects non-integer limits before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue({
				conversationId: 'conversation-1',
				limit: 'many'
			})
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('limit must be an integer between 1 and 100');
		expect(mocks.mockSupabase.from).not.toHaveBeenCalled();
	});

	it('trims conversation ids before querying messages and joining the room', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue({
				conversationId: '  conversation-1  ',
				limit: 25
			})
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true, messages: [], hasMore: false });
		expect(mocks.participantEq).toHaveBeenCalledWith('conversation_id', 'conversation-1');
		expect(mocks.messageConversationEq).toHaveBeenCalledWith('conversation_id', 'conversation-1');
		expect(mocks.mockJoinRoom).toHaveBeenCalledWith('internal-user-id', 'conversation-1');
	});
});
