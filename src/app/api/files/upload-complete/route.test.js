import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	from: vi.fn(),
	broadcastToRoom: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(() => ({
		auth: {
			getUser: mocks.getUser
		},
		from: mocks.from
	}))
}));

vi.mock('@/lib/api/sse-manager.js', () => ({
	sseManager: {
		broadcastToRoom: mocks.broadcastToRoom
	}
}));

vi.mock('@/lib/api/protocol.js', () => ({
	MESSAGE_TYPES: {
		NEW_MESSAGE: 'message.new'
	}
}));

describe('POST /api/files/upload-complete validation', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.getUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
	});

	it('returns 400 for malformed JSON before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
		expect(mocks.from).not.toHaveBeenCalled();
		expect(mocks.broadcastToRoom).not.toHaveBeenCalled();
	});

	it('rejects non-object JSON before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue('storage-path')
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Request body must be a JSON object');
		expect(mocks.from).not.toHaveBeenCalled();
		expect(mocks.broadcastToRoom).not.toHaveBeenCalled();
	});

	it('rejects non-object metadata before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue({
				storagePath: 'auth-user-id/conversation-1/file-1',
				fileId: 'file-1',
				metadata: 'not-metadata'
			})
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid metadata');
		expect(mocks.from).not.toHaveBeenCalled();
		expect(mocks.broadcastToRoom).not.toHaveBeenCalled();
	});

	it('rejects non-object encrypted metadata before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue({
				storagePath: 'auth-user-id/conversation-1/file-1',
				fileId: 'file-1',
				metadata: {
					messageId: 'message-1',
					conversationId: 'conversation-1',
					encryptedMetadata: 'not-a-recipient-map'
				}
			})
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid encrypted metadata');
		expect(mocks.from).not.toHaveBeenCalled();
		expect(mocks.broadcastToRoom).not.toHaveBeenCalled();
	});

	it('rejects empty encrypted metadata before database work', async () => {
		const { POST } = await import('./route.js');
		const request = {
			json: vi.fn().mockResolvedValue({
				storagePath: 'auth-user-id/conversation-1/file-1',
				fileId: 'file-1',
				metadata: {
					messageId: 'message-1',
					conversationId: 'conversation-1',
					encryptedMetadata: {}
				}
			})
		};

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid encrypted metadata');
		expect(mocks.from).not.toHaveBeenCalled();
		expect(mocks.broadcastToRoom).not.toHaveBeenCalled();
	});
});
