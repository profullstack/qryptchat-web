import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockSupabase: {
		from: vi.fn()
	},
	mockJoinRoom: vi.fn(),
	mockSendToUser: vi.fn()
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
		joinRoom: mocks.mockJoinRoom,
		sendToUser: mocks.mockSendToUser
	}
}));

vi.mock('@/lib/api/protocol.js', () => ({
	MESSAGE_TYPES: {
		CONVERSATION_CREATED: 'conversation.created'
	}
}));

describe('POST /api/conversations/create validation', () => {
	it('returns 400 for malformed JSON instead of a generic 500', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
		expect(mocks.mockSupabase.from).not.toHaveBeenCalled();
	});

	it('rejects non-object JSON before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue(['user-1'])
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Request body must be a JSON object');
		expect(mocks.mockSupabase.from).not.toHaveBeenCalled();
	});
});
