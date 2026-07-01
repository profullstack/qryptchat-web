import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	serviceFrom: vi.fn(),
	userEq: vi.fn(),
	participantEq: vi.fn(),
	updateEq: vi.fn()
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

function createParticipantReadQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: mocks.participantEq,
		is: vi.fn(() => query),
		single: vi.fn().mockResolvedValue({
			data: { disappear_seconds: 60, start_on: 'read' },
			error: null
		})
	};
	mocks.participantEq.mockReturnValue(query);
	return query;
}

function createParticipantUpdateQuery() {
	const query = {
		update: vi.fn(() => query),
		eq: mocks.updateEq,
		select: vi.fn(() => query),
		single: vi.fn().mockResolvedValue({
			data: { disappear_seconds: 300, start_on: 'delivered' },
			error: null
		})
	};
	mocks.updateEq.mockReturnValue(query);
	return query;
}

function makeRequest(body) {
	return new Request('https://qrypt.chat/api/conversations/conversation-1/disappearing-messages', {
		method: body ? 'PUT' : 'GET',
		headers: {
			cookie: 'sb-access-token=valid-token'
		},
		body: body ? JSON.stringify(body) : undefined
	});
}

describe('/api/conversations/[id]/disappearing-messages', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
	});

	it('resolves async route params before reading settings', async () => {
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'conversation_participants') return createParticipantReadQuery();
			throw new Error(`Unexpected table: ${table}`);
		});

		const { GET } = await import('./route.js');
		const response = await GET(makeRequest(), {
			params: Promise.resolve({ id: 'conversation-1' })
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.settings.disappear_seconds).toBe(60);
		expect(mocks.participantEq).toHaveBeenCalledWith('conversation_id', 'conversation-1');
	});

	it('resolves async route params before updating settings', async () => {
		let participantCalls = 0;
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'conversation_participants') {
				participantCalls += 1;
				return participantCalls === 1 ? createParticipantReadQuery() : createParticipantUpdateQuery();
			}
			throw new Error(`Unexpected table: ${table}`);
		});

		const { PUT } = await import('./route.js');
		const response = await PUT(makeRequest({ disappear_seconds: 300, start_on: 'delivered' }), {
			params: Promise.resolve({ id: 'conversation-1' })
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.settings.disappear_seconds).toBe(300);
		expect(mocks.participantEq).toHaveBeenCalledWith('conversation_id', 'conversation-1');
		expect(mocks.updateEq).toHaveBeenCalledWith('conversation_id', 'conversation-1');
	});
});
