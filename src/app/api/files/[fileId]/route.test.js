import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	from: vi.fn(),
	eq: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		auth: {
			getUser: mocks.authGetUser
		},
		from: mocks.from
	}))
}));

vi.mock('@/lib/crypto/post-quantum-encryption.js', () => ({
	postQuantumEncryption: {
		initialize: vi.fn(),
		decryptFromSender: vi.fn()
	}
}));

function createFileQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.eq,
		single: vi.fn().mockResolvedValue({
			data: {
				id: 'file-1',
				message_id: 'message-1',
				encrypted_metadata: {},
				created_at: '2026-01-01T00:00:00.000Z',
				created_by: 'user-1',
				messages: [{ conversation_id: 'conversation-1' }]
			},
			error: null
		})
	};
	mocks.eq.mockReturnValue(query);
	return query;
}

describe('/api/files/[fileId]', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'user-1' } },
			error: null
		});
		mocks.from.mockImplementation((table) => {
			if (table === 'encrypted_files') return createFileQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('resolves async route params for HEAD metadata requests', async () => {
		const { HEAD } = await import('./route.js');
		const response = await HEAD(new Request('https://qrypt.chat/api/files/file-1'), {
			params: Promise.resolve({ fileId: 'file-1' })
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
		expect(mocks.eq).toHaveBeenCalledWith('id', 'file-1');
	});

	it('resolves async route params for POST metadata requests', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(new Request('https://qrypt.chat/api/files/file-1', { method: 'POST' }), {
			params: Promise.resolve({ fileId: 'file-1' })
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.id).toBe('file-1');
		expect(body.conversationId).toBe('conversation-1');
		expect(mocks.eq).toHaveBeenCalledWith('id', 'file-1');
	});
});
