import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the server + service Supabase clients. The phone-binding guard runs
// right after getUser(), before any DB work, so only getUser needs behaviour.
const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	serverClient: vi.fn(),
	createClient: vi.fn(() => ({}))
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: mocks.serverClient
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: mocks.createClient
}));

function sessionRequest(body) {
	return new Request('https://example.com/api/auth/verify-sms', {
		method: 'POST',
		headers: {
			authorization: 'Bearer test-session-token',
			'content-type': 'application/json'
		},
		body: JSON.stringify(body)
	});
}

describe('verify-sms session phone binding', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
		process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
		mocks.serverClient.mockResolvedValue({
			auth: { getUser: mocks.getUser }
		});
	});

	it('rejects session signup when the requested phone != JWT-verified phone', async () => {
		// The JWT belongs to +15550000000, but the client claims +15559999999.
		mocks.getUser.mockResolvedValue({
			data: { user: { id: 'user-1', phone: '+15550000000' } },
			error: null
		});

		const { POST } = await import('./route.js');
		const res = await POST(sessionRequest({
			useSession: true,
			phoneNumber: '+15559999999',
			username: 'alice'
		}));
		const body = await res.json();

		expect(res.status).toBe(403);
		expect(body.code).toBe('PHONE_SESSION_MISMATCH');
		expect(mocks.getUser).toHaveBeenCalledWith('test-session-token');
	});

	it('rejects anonymous / phoneless sessions', async () => {
		mocks.getUser.mockResolvedValue({
			data: { user: { id: 'anon', phone: null } },
			error: null
		});

		const { POST } = await import('./route.js');
		const res = await POST(sessionRequest({
			useSession: true,
			phoneNumber: '+15559999999',
			username: 'bob'
		}));

		expect(res.status).toBe(403);
	});
});
