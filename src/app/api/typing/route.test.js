import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockSupabase: {
		from: vi.fn()
	},
	mockBroadcastToRoom: vi.fn(),
	participantResult: {
		data: { id: 'participant-row' },
		error: null
	}
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
		broadcastToRoom: mocks.mockBroadcastToRoom
	}
}));

function createQuery(result) {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		single: vi.fn().mockResolvedValue(result)
	};

	return query;
}

function setupSupabase() {
	mocks.mockSupabase.from.mockImplementation((table) => {
		if (table === 'users') {
			return createQuery({
				data: {
					id: 'internal-user-id',
					username: 'cream',
					display_name: 'Cream'
				},
				error: null
			});
		}

		if (table === 'conversation_participants') {
			return createQuery(mocks.participantResult);
		}

		throw new Error(`Unexpected table: ${table}`);
	});
}

describe('typing API conversation access', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.participantResult = {
			data: { id: 'participant-row' },
			error: null
		};
		setupSupabase();
	});

	it('rejects typing start for conversations the user cannot access', async () => {
		mocks.participantResult = {
			data: null,
			error: { message: 'not found' }
		};

		const { POST } = await import('./start/route.js');
		const response = await POST({
			json: vi.fn().mockResolvedValue({ conversationId: 'conversation-1' })
		});
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body.error).toBe('Access denied to conversation');
		expect(mocks.mockBroadcastToRoom).not.toHaveBeenCalled();
	});

	it('rejects typing stop for conversations the user cannot access', async () => {
		mocks.participantResult = {
			data: null,
			error: { message: 'not found' }
		};

		const { POST } = await import('./stop/route.js');
		const response = await POST({
			json: vi.fn().mockResolvedValue({ conversationId: 'conversation-1' })
		});
		const body = await response.json();

		expect(response.status).toBe(403);
		expect(body.error).toBe('Access denied to conversation');
		expect(mocks.mockBroadcastToRoom).not.toHaveBeenCalled();
	});

	it('broadcasts typing start after membership is verified', async () => {
		const { POST } = await import('./start/route.js');
		const response = await POST({
			json: vi.fn().mockResolvedValue({ conversationId: 'conversation-1' })
		});

		expect(response.status).toBe(200);
		expect(mocks.mockSupabase.from).toHaveBeenCalledWith('conversation_participants');
		expect(mocks.mockBroadcastToRoom).toHaveBeenCalledWith(
			'conversation-1',
			expect.any(String),
			expect.objectContaining({
				userId: 'internal-user-id',
				conversationId: 'conversation-1',
				isTyping: true
			}),
			'internal-user-id'
		);
	});

	it('broadcasts typing stop after membership is verified', async () => {
		const { POST } = await import('./stop/route.js');
		const response = await POST({
			json: vi.fn().mockResolvedValue({ conversationId: 'conversation-1' })
		});

		expect(response.status).toBe(200);
		expect(mocks.mockSupabase.from).toHaveBeenCalledWith('conversation_participants');
		expect(mocks.mockBroadcastToRoom).toHaveBeenCalledWith(
			'conversation-1',
			expect.any(String),
			expect.objectContaining({
				userId: 'internal-user-id',
				conversationId: 'conversation-1',
				isTyping: false
			}),
			'internal-user-id'
		);
	});
});
