import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockSupabase: {
		from: vi.fn()
	},
	mockBroadcastToRoom: vi.fn(),
	mockServiceRoleClient: {}
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

vi.mock('@/lib/supabase/service-role.js', () => ({
	getServiceRoleClient: () => mocks.mockServiceRoleClient
}));

describe('POST /api/messages/send validation', () => {
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

	it('rejects encryptedContents arrays before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue({
				conversationId: 'conversation-1',
				encryptedContents: ['not-a-user-map']
			})
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('encryptedContents must be an object with user_id -> encrypted_content mappings');
		expect(mocks.mockSupabase.from).not.toHaveBeenCalled();
	});

	it('rejects non-string encrypted content values before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue({
				conversationId: 'conversation-1',
				encryptedContents: {
					'user-1': { ciphertext: 'abc' }
				}
			})
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('encryptedContents values must be encrypted content strings');
		expect(mocks.mockSupabase.from).not.toHaveBeenCalled();
	});
});
