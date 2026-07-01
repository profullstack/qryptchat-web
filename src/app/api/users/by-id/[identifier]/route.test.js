import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	rpc: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => ({
		auth: {
			getUser: mocks.authGetUser
		},
		rpc: mocks.rpc
	}))
}));

describe('GET /api/users/by-id/[identifier]', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});
		mocks.rpc.mockResolvedValue({
			data: [
				{
					id: 'user-1',
					username: 'alice',
					display_name: 'Alice',
					avatar_url: null,
					bio: null,
					website: null
				}
			],
			error: null
		});
	});

	it('resolves async route params before identifier validation and lookup', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/users/by-id/qryptchatA1B2C3D4'), {
			params: Promise.resolve({ identifier: 'qryptchatA1B2C3D4' })
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.user.username).toBe('alice');
		expect(mocks.rpc).toHaveBeenCalledWith('find_user_by_unique_identifier', {
			identifier: 'qryptchatA1B2C3D4'
		});
	});

	it('rejects missing identifiers before database lookup', async () => {
		const { GET } = await import('./route.js');
		const response = await GET(new Request('https://qrypt.chat/api/users/by-id/'), {
			params: Promise.resolve({})
		});

		expect(response.status).toBe(400);
		expect(mocks.rpc).not.toHaveBeenCalled();
	});
});
