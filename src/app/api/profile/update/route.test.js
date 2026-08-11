import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	setSession: vi.fn(),
	createSupabaseServerClient: vi.fn(() => ({
		auth: {
			getUser: mocks.getUser,
			setSession: mocks.setSession
		},
		from: vi.fn(() => ({
			update: vi.fn(() => ({
				eq: vi.fn(() => ({
					select: vi.fn(() => ({
						data: [{
							id: 'row-1',
							username: 'alice',
							display_name: 'Alice',
							avatar_url: null,
							bio: 'hello',
							website: null
						}],
						error: null
					}))
				}))
			}))
		}))
	}))
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: mocks.createSupabaseServerClient
}));

function profileRequest(authorization, body = { bio: 'hello' }) {
	return new Request('https://example.com/api/profile/update', {
		method: 'POST',
		headers: authorization ? { authorization } : {},
		body: JSON.stringify(body)
	});
}

describe('profile update bearer authentication', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.getUser.mockResolvedValue({
			data: { user: { id: 'user-1', email: 'alice@example.com', phone: null } },
			error: null
		});
	});

	it('normalizes bearer scheme casing and extra spaces before validating the token', async () => {
		const { POST } = await import('./route.js');

		const response = await POST(profileRequest('bearer   access-token-123  '));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(mocks.getUser).toHaveBeenCalledWith('access-token-123');
		expect(mocks.setSession).toHaveBeenCalledWith({
			access_token: 'access-token-123',
			refresh_token: ''
		});
	});

	it('rejects an empty bearer header before creating a Supabase client', async () => {
		const { POST } = await import('./route.js');

		const response = await POST(profileRequest('Bearer   '));
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe('Missing or invalid authorization header');
		expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
		expect(mocks.getUser).not.toHaveBeenCalled();
	});

	it('returns 400 for malformed JSON before authentication work', async () => {
		const { POST } = await import('./route.js');

		const response = await POST({
			headers: new Headers({ authorization: 'Bearer access-token-123' }),
			json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
		expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
		expect(mocks.getUser).not.toHaveBeenCalled();
	});

	it.each([
		['bio', null, 'Bio must be a string'],
		['bio', false, 'Bio must be a string'],
		['bio', 0, 'Bio must be a string'],
		['website', null, 'Website must be a string'],
		['website', false, 'Website must be a string'],
		['website', 0, 'Website must be a string']
	])(
		'rejects falsy non-string %s values instead of throwing',
		async (field, value, expectedError) => {
			const { POST } = await import('./route.js');

			const response = await POST(profileRequest('Bearer access-token-123', { [field]: value }));
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe(expectedError);
		}
	);
});
