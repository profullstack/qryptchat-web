import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	from: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		auth: { getUser: mocks.authGetUser },
		from: mocks.from
	}))
}));

function createUsersQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
	};
	return query;
}

describe('POST /api/chat/conversations participant validation', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
		mocks.from.mockImplementation((table) => {
			if (table === 'users') return createUsersQuery();
			throw new Error(`Unexpected database table: ${table}`);
		});
	});

	it.each([
		['blank', ['  ']],
		['non-string', [null]]
	])('rejects %s participant ids before conversation creation', async (_label, participant_ids) => {
		const { POST } = await import('./route.js');
		const response = await POST(new Request('https://qrypt.chat/api/chat/conversations', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'direct', participant_ids })
		}));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('participant_ids must contain non-empty strings');
		expect(mocks.from).toHaveBeenCalledWith('users');
		expect(mocks.from).toHaveBeenCalledTimes(1);
	});
});
