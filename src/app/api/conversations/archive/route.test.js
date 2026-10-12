import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	rpc: vi.fn(),
	sendToUser: vi.fn(),
	appUserId: vi.fn()
}));

vi.mock('@/lib/api/sse-manager.js', () => ({ sseManager: { sendToUser: mocks.sendToUser } }));
vi.mock('@/lib/supabase/service-role.js', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/chat/group-invites.js', () => ({ appUserId: mocks.appUserId }));

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
		mocks.appUserId.mockResolvedValue('user-1');
	});

	it('tells every device of the user that the chat was archived', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(createRequest('conversation-1'));
		expect(response.status).toBe(200);
		expect(mocks.sendToUser).toHaveBeenCalledWith('user-1', 'CONVERSATION_ARCHIVED', expect.objectContaining({ conversationId: 'conversation-1', archived: true }));
	});

	it('still succeeds when the announcement cannot be made', async () => {
		mocks.appUserId.mockRejectedValue(new Error('no db'));
		const { POST } = await import('./route.js');
		const response = await POST(createRequest('conversation-1'));
		expect(response.status).toBe(200);
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
