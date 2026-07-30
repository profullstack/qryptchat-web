import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockSupabase: {
		from: vi.fn()
	},
	mockJoinRoom: vi.fn(),
	userEq: vi.fn()
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

function createRequest(conversationId) {
	return {
		json: vi.fn().mockResolvedValue({ conversationId })
	};
}

describe('POST /api/conversations/join', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.mockSupabase.from.mockImplementation((table) => {
			if (table === 'users') return createUserQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('rejects blank conversation ids before user lookup', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(createRequest('   '));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Missing conversationId' });
		expect(mocks.mockSupabase.from).not.toHaveBeenCalled();
		expect(mocks.mockJoinRoom).not.toHaveBeenCalled();
	});

	it('trims conversation ids before joining the SSE room', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(createRequest('  conversation-1  '));

		expect(response.status).toBe(200);
		expect(mocks.userEq).toHaveBeenCalledWith('auth_user_id', 'auth-user-id');
		expect(mocks.mockJoinRoom).toHaveBeenCalledWith('internal-user-id', 'conversation-1');
	});
});
