import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	rpc: vi.fn()
}));

vi.mock('@/lib/api/middleware/auth.js', () => ({
	withAuth: (handler) => (request, context) =>
		handler({
			request,
			locals: {
				supabase: {
					rpc: mocks.rpc
				},
				user: { id: 'auth-user-id' }
			},
			context
		})
}));

function createRequest(conversationId) {
	return {
		json: vi.fn().mockResolvedValue({ conversationId })
	};
}

describe('conversation archive routes', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.rpc.mockResolvedValue({ data: true, error: null });
	});

	it('trims conversation ids before archiving', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(createRequest('  conversation-1  '));

		expect(response.status).toBe(200);
		expect(mocks.rpc).toHaveBeenCalledWith('archive_conversation', {
			conversation_uuid: 'conversation-1',
			user_uuid: 'auth-user-id'
		});
	});

	it('rejects blank archive conversation ids before calling the database', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(createRequest('   '));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Missing conversationId' });
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it('rejects blank unarchive conversation ids before calling the database', async () => {
		const { POST } = await import('../unarchive/route.js');
		const response = await POST(createRequest('   '));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Missing conversationId' });
		expect(mocks.rpc).not.toHaveBeenCalled();
	});
});
