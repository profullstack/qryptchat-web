import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const update = vi.fn();
	const getUser = vi.fn();
	const client = {
		auth: { getUser },
		from: vi.fn(() => ({
			update: (data) => {
				update(data);
				return {
					eq: () => ({
						select: () => ({
							data: [{ id: 'row-1', username: 'alice', display_name: 'Alice', avatar_url: null, bio: 'hello', website: null, emoji: '🔭', pronouns: 'she/her', ...data }],
							error: null
						})
					})
				};
			}
		}))
	};
	return { update, getUser, client, createSupabaseServerClientWithToken: vi.fn(async () => client) };
});

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClientWithToken: mocks.createSupabaseServerClientWithToken
}));

function profileRequest(authorization, body = { bio: 'hello' }) {
	return new Request('https://example.com/api/profile/update', {
		method: 'POST',
		headers: authorization ? { authorization } : {},
		body: JSON.stringify(body)
	});
}

describe('profile update', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
	});

	it('authenticates with a token-scoped client (no setSession with an empty refresh token)', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(profileRequest('bearer   access-token-123  '));
		expect(response.status).toBe(200);
		expect(mocks.createSupabaseServerClientWithToken).toHaveBeenCalledWith('access-token-123');
		expect(mocks.getUser).toHaveBeenCalledWith('access-token-123');
	});

	it('rejects an empty bearer header before creating a Supabase client', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(profileRequest('Bearer   '));
		expect(response.status).toBe(401);
		expect((await response.json()).error).toBe('Missing or invalid authorization header');
		expect(mocks.createSupabaseServerClientWithToken).not.toHaveBeenCalled();
	});

	it('returns 400 for malformed JSON before authentication work', async () => {
		const { POST } = await import('./route.js');
		const response = await POST({
			headers: new Headers({ authorization: 'Bearer access-token-123' }),
			json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
		});
		expect(response.status).toBe(400);
		expect(mocks.createSupabaseServerClientWithToken).not.toHaveBeenCalled();
	});

	it('saves emoji, pronouns and website (OpenProfile 0.4 default fields)', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(profileRequest('Bearer t', { emoji: ' 🔭 ', pronouns: ' she/her ', website: 'ada.example' }));
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ emoji: '🔭', pronouns: 'she/her', website: 'https://ada.example/' }));
		expect(body.user).toMatchObject({ emoji: '🔭', pronouns: 'she/her', website: 'https://ada.example/' });
	});

	it('clears a field with an empty string or null, and leaves out what is not sent', async () => {
		const { POST } = await import('./route.js');
		await POST(profileRequest('Bearer t', { emoji: '', pronouns: null }));
		const data = mocks.update.mock.calls[0][0];
		expect(data).toMatchObject({ emoji: null, pronouns: null });
		expect('website' in data).toBe(false);
		expect('bio' in data).toBe(false);
	});

	it('saves a display name, trimmed, with control and bidi characters stripped', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(profileRequest('Bearer t', { displayName: '  Daniel\u202E  C.\u0007B  ' }));
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Daniel C. B' }));
		expect(body.user.displayName).toBe('Daniel C. B');
	});

	it('accepts display_name as well as displayName', async () => {
		const { POST } = await import('./route.js');
		await POST(profileRequest('Bearer t', { display_name: 'DB' }));
		expect(mocks.update.mock.calls[0][0].display_name).toBe('DB');
	});

	it('keeps the current display name when it is sent empty, and never touches it when left out', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(profileRequest('Bearer t', { displayName: '  \u200B ' }));
		expect(response.status).toBe(200);
		expect('display_name' in mocks.update.mock.calls[0][0]).toBe(false);
		expect((await response.json()).user.displayName).toBe('Alice');
		await POST(profileRequest('Bearer t', { bio: 'hi' }));
		expect('display_name' in mocks.update.mock.calls[1][0]).toBe(false);
	});

	it.each([
		[{ emoji: 'abc' }, 'Pick a single emoji'],
		[{ emoji: '🔭🚀' }, 'Pick a single emoji'],
		[{ pronouns: 'x'.repeat(41) }, 'Pronouns can be at most 40 characters'],
		[{ pronouns: 'she/<b>her</b>' }, 'Pronouns contain characters that are not allowed'],
		[{ website: 'javascript:alert(1)' }, 'Website must be an http(s) link'],
		[{ website: 'not a url' }, 'Please enter a valid website URL'],
		[{ bio: false }, 'Bio must be a string'],
		[{ bio: 'x'.repeat(501) }, 'Bio must be 500 characters or less'],
		[{ website: 0 }, 'Website must be text'],
		[{ displayName: 'x'.repeat(51) }, 'Display name can be at most 50 characters'],
		[{ displayName: '<b>DB</b>' }, 'Display name contains characters that are not allowed'],
		[{ displayName: 42 }, 'Display name must be text']
	])('rejects %j', async (payload, error) => {
		const { POST } = await import('./route.js');
		const response = await POST(profileRequest('Bearer t', payload));
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe(error);
		expect(mocks.update).not.toHaveBeenCalled();
	});
});
