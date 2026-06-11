import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockSupabase: {
		from: vi.fn()
	},
	mockJoinRoom: vi.fn()
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

describe('POST /api/messages/load validation', () => {
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
});
