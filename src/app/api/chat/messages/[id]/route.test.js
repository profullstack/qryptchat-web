import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	from: vi.fn(),
	userEq: vi.fn(),
	messageEq: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		auth: {
			getUser: mocks.authGetUser
		},
		from: mocks.from
	}))
}));

function createUsersQuery() {
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

function createMessagesQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.messageEq,
		single: vi.fn().mockResolvedValue({
			data: {
				id: 'message-1',
				message_recipients: [
					{
						encrypted_content: Buffer.from('encrypted-payload').toString('base64')
					}
				]
			},
			error: null
		})
	};
	mocks.messageEq.mockReturnValue(query);
	return query;
}

describe('GET /api/chat/messages/[id]', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});

		mocks.from.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'messages') return createMessagesQuery();
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('resolves async route params before fetching the message', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/chat/messages/message-1', {
				headers: { cookie: 'sb-access-token=valid-token' }
			}),
			{ params: Promise.resolve({ id: 'message-1' }) }
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.id).toBe('message-1');
		expect(body.encrypted_content).toBe('encrypted-payload');
		expect(mocks.messageEq).toHaveBeenCalledWith('id', 'message-1');
	});

	it('rejects missing async route params before authentication', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/chat/messages/'), {
			params: Promise.resolve({})
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Message ID is required' });
		expect(mocks.authGetUser).not.toHaveBeenCalled();
	});
});
