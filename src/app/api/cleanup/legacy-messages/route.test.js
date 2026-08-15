import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	getSession: vi.fn(),
	serviceFrom: vi.fn(),
	messageDelete: vi.fn()
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

/** Records every filter applied on the way to select() or delete(). */
function createMessagesQuery(state) {
	const select = {
		eq: vi.fn((column, value) => {
			state.selectFilters.push([column, value]);
			return select;
		}),
		or: vi.fn(() => select),
		limit: vi.fn(() =>
			Promise.resolve({ data: [{ id: 'msg-1' }, { id: 'msg-2' }], error: null })
		)
	};

	const del = {
		in: vi.fn((column, value) => {
			state.deleteFilters.push([column, value]);
			return del;
		}),
		eq: vi.fn((column, value) => {
			state.deleteFilters.push([column, value]);
			return mocks.messageDelete();
		})
	};

	return {
		select: vi.fn(() => select),
		delete: vi.fn(() => del)
	};
}

describe('DELETE /api/cleanup/legacy-messages', () => {
	let state;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		state = { selectFilters: [], deleteFilters: [] };

		mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user-id' } }, error: null });
		mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'auth-user-id' } } } });
		mocks.messageDelete.mockResolvedValue({ error: null });
		mocks.serviceFrom.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			if (table === 'messages') return createMessagesQuery(state);
			throw new Error(`Unexpected table: ${table}`);
		});
	});

	it('re-validates the JWT with getUser() and never trusts getSession()', async () => {
		const { DELETE } = await import('./route.js');
		await DELETE(new Request('https://qrypt.chat/api/cleanup/legacy-messages', { method: 'DELETE' }));

		expect(mocks.getUser).toHaveBeenCalled();
		expect(mocks.getSession).not.toHaveBeenCalled();
	});

	it('rejects an unauthenticated caller before touching any data', async () => {
		mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });

		const { DELETE } = await import('./route.js');
		const response = await DELETE(
			new Request('https://qrypt.chat/api/cleanup/legacy-messages', { method: 'DELETE' })
		);

		expect(response.status).toBe(401);
		expect(mocks.serviceFrom).not.toHaveBeenCalled();
	});

	it('scopes both the search and the delete to the caller as sender', async () => {
		const { DELETE } = await import('./route.js');
		const response = await DELETE(
			new Request('https://qrypt.chat/api/cleanup/legacy-messages', { method: 'DELETE' })
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.deletedCount).toBe(2);

		// The platform-wide variant of this route had no user filter at all.
		expect(state.selectFilters).toContainEqual(['sender_id', 'internal-user-id']);
		expect(state.deleteFilters).toContainEqual(['sender_id', 'internal-user-id']);
		expect(state.deleteFilters).toContainEqual(['id', ['msg-1', 'msg-2']]);
	});
});
