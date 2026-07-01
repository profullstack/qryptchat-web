import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	from: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		auth: {
			getUser: mocks.authGetUser
		}
	}))
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		from: mocks.from
	}))
}));

function createDeleteQuery(result) {
	const query = {
		delete: vi.fn(() => query),
		eq: vi.fn().mockResolvedValue(result)
	};
	return query;
}

describe('POST /api/keys/delete', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
	});

	it('deletes the authenticated public key without touching the users profile table', async () => {
		const deleteQuery = createDeleteQuery({ error: null });
		mocks.from.mockImplementation((table) => {
			if (table === 'user_public_keys') return deleteQuery;
			throw new Error(`Unexpected table: ${table}`);
		});

		const { POST } = await import('./route.js');
		const response = await POST();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true, message: 'Public key deleted successfully' });
		expect(mocks.from).toHaveBeenCalledWith('user_public_keys');
		expect(mocks.from).not.toHaveBeenCalledWith('users');
		expect(deleteQuery.eq).toHaveBeenCalledWith('user_id', 'auth-user-id');
	});

	it('returns a database error when public key deletion fails', async () => {
		const deleteQuery = createDeleteQuery({ error: { message: 'delete failed' } });
		mocks.from.mockImplementation((table) => {
			if (table === 'user_public_keys') return deleteQuery;
			throw new Error(`Unexpected table: ${table}`);
		});

		const { POST } = await import('./route.js');
		const response = await POST();
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body).toEqual({ error: 'Database deletion failed: delete failed' });
		expect(mocks.from).not.toHaveBeenCalledWith('users');
	});
});
