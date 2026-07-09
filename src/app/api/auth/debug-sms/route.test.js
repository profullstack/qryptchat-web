import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	runDiagnostics: vi.fn(),
	SMSAuthDiagnostics: vi.fn(function SMSAuthDiagnostics(request) {
		this.request = request;
		this.logger = { getLogs: () => [] };
		this.runDiagnostics = mocks.runDiagnostics;
	})
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(() => ({
		auth: {
			getUser: mocks.getUser
		}
	}))
}));

vi.mock('@/lib/utils/sms-debug.js', () => ({
	SMSAuthDiagnostics: mocks.SMSAuthDiagnostics
}));

function debugRequest(method, body) {
	return new Request('https://example.com/api/auth/debug-sms', {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
}

describe('SMS debug endpoint', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.stubEnv('NODE_ENV', 'development');
		mocks.getUser.mockResolvedValue({
			data: { user: { id: 'user-1' } },
			error: null
		});
		mocks.runDiagnostics.mockResolvedValue({
			success: true,
			issues: [],
			logs: []
		});
	});

	it('uses the incoming request for authenticated POST diagnostics', async () => {
		const { POST } = await import('./route.js');
		const request = debugRequest('POST', { phoneNumber: '+1234567890' });

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(mocks.SMSAuthDiagnostics).toHaveBeenCalledWith(request);
		expect(mocks.runDiagnostics).toHaveBeenCalledWith('+1234567890');
	});

	it('uses the incoming request for authenticated GET diagnostics', async () => {
		const { GET } = await import('./route.js');
		const request = debugRequest('GET');

		const response = await GET(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.systemStatus).toBe('healthy');
		expect(mocks.SMSAuthDiagnostics).toHaveBeenCalledWith(request);
		expect(mocks.runDiagnostics).toHaveBeenCalledWith('+1234567890');
	});
});
