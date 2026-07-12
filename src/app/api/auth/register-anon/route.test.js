import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	serverAuthGetUser: vi.fn(),
	createSupabaseServerClient: vi.fn(() => ({
		auth: {
			getUser: mocks.serverAuthGetUser
		}
	})),
	createClient: vi.fn(() => ({})),
	verifyInviteToken: vi.fn(),
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: mocks.createSupabaseServerClient
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: mocks.createClient
}));

vi.mock('@/lib/invites/verify.js', () => ({
	verifyInviteToken: mocks.verifyInviteToken,
	InviteVerificationError: class InviteVerificationError extends Error {}
}));

function registerRequest(authorization) {
	return new Request('https://example.com/api/auth/register-anon', {
		method: 'POST',
		headers: authorization ? { authorization } : {},
		body: JSON.stringify({
			inviteToken: 'qci1.payload.signature',
			username: 'anon-user',
			publicKey: 'ml-kem-public-key'
		})
	});
}

describe('register-anon bearer authentication', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.serverAuthGetUser.mockResolvedValue({
			data: { user: null },
			error: { message: 'invalid session' }
		});
	});

	it('normalizes bearer scheme casing and extra spaces before validating the session', async () => {
		const { POST } = await import('./route.js');

		const response = await POST(registerRequest('bearer   access-token-123  '));
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe('Invalid or expired session');
		expect(mocks.serverAuthGetUser).toHaveBeenCalledWith('access-token-123');
		expect(mocks.verifyInviteToken).not.toHaveBeenCalled();
	});

	it('does not validate an empty bearer header', async () => {
		const { POST } = await import('./route.js');

		const response = await POST(registerRequest('Bearer   '));
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe('Missing authorization header');
		expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
		expect(mocks.serverAuthGetUser).not.toHaveBeenCalled();
		expect(mocks.verifyInviteToken).not.toHaveBeenCalled();
	});
});
