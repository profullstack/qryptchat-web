import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	runDiagnostics: vi.fn(),
	testSMSVerification: vi.fn(),
	SMSAuthDiagnostics: vi.fn(function SMSAuthDiagnostics(request) {
		this.request = request;
		this.logger = { getLogs: () => [] };
		this.runDiagnostics = mocks.runDiagnostics;
		this.testSMSVerification = mocks.testSMSVerification;
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
		mocks.testSMSVerification.mockResolvedValue({
			success: true,
			error: null,
			data: { verified: true }
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

	it('reuses the parsed POST body for verify diagnostics', async () => {
		const { POST } = await import('./route.js');
		const request = debugRequest('POST', {
			phoneNumber: '+1234567890',
			action: 'test-verify',
			verificationCode: '123456'
		});

		const response = await POST(request);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(mocks.testSMSVerification).toHaveBeenCalledWith('+1234567890', '123456');
	});

	it('returns 400 for malformed POST JSON instead of a generic 500', async () => {
		const { POST } = await import('./route.js');
		const response = await POST({
			json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
		expect(mocks.SMSAuthDiagnostics).not.toHaveBeenCalled();
	});
});
