import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	serviceFrom: vi.fn(),
	userEq: vi.fn(),
	participantEq: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		auth: {
			getUser: mocks.authGetUser
		}
	}))
}));

vi.mock('@/lib/supabase/service-role.js', () => ({
	createServiceRoleClient: vi.fn(() => ({
		from: mocks.serviceFrom
	}))
}));

function paddedCookieValue() {
	return 'base64-eyJhY2Nlc3NfdG9rZW4iOiJhYmMiLCJwYWRkaW5nIjoieCJ9==';
}

function createUsersQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.userEq,
		single: vi.fn().mockResolvedValue({
			data: { id: 'internal-user-id', auth_user_id: 'auth-user-id', username: 'alice' },
			error: null
		})
	};
	mocks.userEq.mockReturnValue(query);
	return query;
}

function createParticipantCheckQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.participantEq,
		is: vi.fn(() => query),
		single: vi.fn().mockResolvedValue({
			data: { user_id: 'internal-user-id' },
			error: null
		})
	};
	mocks.participantEq.mockReturnValue(query);
	return query;
}

function createParticipantsListQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.participantEq,
		is: vi.fn().mockResolvedValue({
			data: [
				{
					user_id: 'internal-user-id',
					role: 'member',
					joined_at: '2026-01-01T00:00:00.000Z',
					users: {
						id: 'internal-user-id',
						username: 'alice',
						display_name: 'Alice',
						avatar_url: null
					}
				}
			],
			error: null
		})
	};
	mocks.participantEq.mockReturnValue(query);
	return query;
}

describe('GET /api/chat/conversations/[id]/participants', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
	});

	it('resolves async route params before querying participants', async () => {
		let participantQueries = 0;
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'conversation_participants') {
				participantQueries += 1;
				return participantQueries === 1 ? createParticipantCheckQuery() : createParticipantsListQuery();
			}
			throw new Error(`Unexpected table: ${table}`);
		});

		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/chat/conversations/conversation-1/participants', {
				headers: { cookie: 'session=header.payload.signature' }
			}),
			{ params: Promise.resolve({ id: 'conversation-1' }) }
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.conversation_id).toBe('conversation-1');
		expect(body.participants).toHaveLength(1);
		expect(mocks.participantEq).toHaveBeenCalledWith('conversation_id', 'conversation-1');
	});

	it('preserves equals padding in base64 auth cookies', async () => {
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'conversation_participants') {
				return createParticipantCheckQuery();
			}
			throw new Error(`Unexpected table: ${table}`);
		});

		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/chat/conversations/conversation-1/participants', {
				headers: { cookie: `sb-xydzwxwsbgmznthiiscl-auth-token=${paddedCookieValue()}` }
			}),
			{ params: Promise.resolve({ id: 'conversation-1' }) }
		);

		expect(response.status).toBe(200);
		expect(mocks.authGetUser).toHaveBeenCalledWith('abc');
	});

	it('rejects missing async route params after authentication', async () => {
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			throw new Error(`Unexpected table: ${table}`);
		});

		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/chat/conversations/participants', {
				headers: { cookie: 'session=header.payload.signature' }
			}),
			{ params: Promise.resolve({}) }
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Missing conversation ID' });
		expect(mocks.authGetUser).toHaveBeenCalled();
	});

	it('rejects whitespace-only conversation IDs before participant lookup', async () => {
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'conversation_participants') throw new Error('Participant lookup should not run');
			throw new Error(`Unexpected table: ${table}`);
		});

		const { GET } = await import('./route.js');
		const response = await GET(
			new Request('https://qrypt.chat/api/chat/conversations/%20%20/participants', {
				headers: { cookie: 'session=header.payload.signature' }
			}),
			{ params: Promise.resolve({ id: '   ' }) }
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Missing conversation ID' });
		expect(mocks.authGetUser).toHaveBeenCalled();
	});
});
