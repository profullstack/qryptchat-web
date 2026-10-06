import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	userEq: vi.fn(),
	participationEq: vi.fn(),
	conversationsIn: vi.fn()
}));

vi.mock('@/lib/api/middleware/auth.js', () => ({
	withAuth: (handler) => (request, context) =>
		handler({
			request,
			locals: {
				supabase: {
					from: mocks.from
				},
				user: { id: 'auth-user-id' }
			},
			context
		})
}));

function createUserQuery(result) {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.userEq,
		single: vi.fn().mockResolvedValue(result)
	};
	mocks.userEq.mockReturnValue(query);
	return query;
}

function createParticipationsQuery(result) {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.participationEq
	};
	mocks.participationEq.mockResolvedValue(result);
	return query;
}

function createConversationsQuery(result) {
	const query = {
		select: vi.fn(() => query),
		in: mocks.conversationsIn,
		order: vi.fn().mockResolvedValue(result)
	};
	mocks.conversationsIn.mockReturnValue(query);
	return query;
}

describe('POST /api/conversations/load', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.from.mockImplementation((table) => {
			if (table === 'users') {
				return createUserQuery({
					data: { id: 'internal-user-id' },
					error: null
				});
			}

			if (table === 'conversation_participants') {
				return createParticipationsQuery({
					data: [{ conversation_id: 'conversation-1' }],
					error: null
				});
			}

			if (table === 'conversations') {
				return createConversationsQuery({
					data: [{ id: 'conversation-1' }],
					error: null
				});
			}

			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('loads participations with the internal user id resolved from auth_user_id', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(new Request('https://qrypt.chat/api/conversations/load', { method: 'POST' }));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.conversations).toEqual([{ id: 'conversation-1' }]);
		expect(mocks.userEq).toHaveBeenCalledWith('auth_user_id', 'auth-user-id');
		expect(mocks.participationEq).toHaveBeenCalledWith('user_id', 'internal-user-id');
		expect(mocks.conversationsIn).toHaveBeenCalledWith('id', ['conversation-1']);
	});

	it('embeds participants from users (there is no profiles table) without private columns', async () => {
		const { POST } = await import('./route.js');
		await POST(new Request('https://qrypt.chat/api/conversations/load', { method: 'POST' }));
		const conversationsQuery = mocks.from.mock.results[mocks.from.mock.calls.findIndex(([t]) => t === 'conversations')].value;
		const select = conversationsQuery.select.mock.calls[0][0];
		expect(select).toContain('user:users!conversation_participants_user_id_fkey(');
		expect(select).not.toContain('profiles');
		expect(select).not.toMatch(/phone_number|salt|\*\)/);
	});

	it('returns 404 when the authenticated user has no internal profile', async () => {
		mocks.from.mockImplementation((table) => {
			if (table === 'users') {
				return createUserQuery({
					data: null,
					error: { message: 'not found' }
				});
			}

			throw new Error(`Unexpected table: ${table}`);
		});

		const { POST } = await import('./route.js');
		const response = await POST(new Request('https://qrypt.chat/api/conversations/load', { method: 'POST' }));
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toEqual({ error: 'User not found' });
		expect(mocks.from).not.toHaveBeenCalledWith('conversation_participants');
	});
});
