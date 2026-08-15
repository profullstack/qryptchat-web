import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	getSession: vi.fn(),
	serviceFrom: vi.fn(),
	conversationDelete: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		auth: { getUser: mocks.getUser, getSession: mocks.getSession }
	}))
}));

vi.mock('@/lib/supabase/service-role.js', () => ({
	createServiceRoleClient: vi.fn(() => ({ from: mocks.serviceFrom }))
}));

function createUsersQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		single: vi.fn(() => Promise.resolve({ data: { id: 'internal-user-id' }, error: null }))
	};
	return query;
}

// The caller participates in conv-empty and conv-busy; conv-other belongs to
// someone else entirely and must never be considered.
function createParticipantsQuery(state) {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn((column, value) => {
			state.participantFilters.push([column, value]);
			return Promise.resolve({
				data: [{ conversation_id: 'conv-empty' }, { conversation_id: 'conv-busy' }],
				error: null
			});
		})
	};
	return query;
}

function createMessagesQuery(state) {
	const query = {
		select: vi.fn(() => query),
		in: vi.fn((column, value) => {
			state.messageScope.push([column, value]);
			return Promise.resolve({ data: [{ conversation_id: 'conv-busy' }], error: null });
		})
	};
	return query;
}

function createConversationsQuery(state) {
	return {
		delete: vi.fn(() => ({
			in: vi.fn((column, value) => {
				state.deleted.push([column, value]);
				return mocks.conversationDelete();
			})
		}))
	};
}

describe('DELETE /api/cleanup/empty-conversations', () => {
	let state;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		state = { participantFilters: [], messageScope: [], deleted: [] };

		mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user-id' } }, error: null });
		mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'auth-user-id' } } } });
		mocks.conversationDelete.mockResolvedValue({ error: null });
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'conversation_participants') return createParticipantsQuery(state);
			if (table === 'messages') return createMessagesQuery(state);
			if (table === 'conversations') return createConversationsQuery(state);
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('re-validates the JWT with getUser() and never trusts getSession()', async () => {
		const { DELETE } = await import('./route.js');
		await DELETE(
			new Request('https://qrypt.chat/api/cleanup/empty-conversations', { method: 'DELETE' })
		);

		expect(mocks.getUser).toHaveBeenCalled();
		expect(mocks.getSession).not.toHaveBeenCalled();
	});

	it('rejects an unauthenticated caller before touching any data', async () => {
		mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });

		const { DELETE } = await import('./route.js');
		const response = await DELETE(
			new Request('https://qrypt.chat/api/cleanup/empty-conversations', { method: 'DELETE' })
		);

		expect(response.status).toBe(401);
		expect(mocks.serviceFrom).not.toHaveBeenCalled();
	});

	it('only deletes empty conversations the caller participates in', async () => {
		const { DELETE } = await import('./route.js');
		const response = await DELETE(
			new Request('https://qrypt.chat/api/cleanup/empty-conversations', { method: 'DELETE' })
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.deletedCount).toBe(1);

		// Candidates come from the caller's own participant rows...
		expect(state.participantFilters).toContainEqual(['user_id', 'internal-user-id']);
		// ...emptiness is only ever evaluated within that set...
		expect(state.messageScope).toContainEqual([
			'conversation_id',
			['conv-empty', 'conv-busy']
		]);
		// ...and only the empty one is deleted.
		expect(state.deleted).toEqual([['id', ['conv-empty']]]);
	});
});
