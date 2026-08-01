import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	diagnoseSMSConfig: vi.fn(),
	generateDiagnosticReport: vi.fn(),
	createSupabaseServerClient: vi.fn()
}));

vi.mock('@/lib/utils/sms-config-diagnostic.js', () => ({
	diagnoseSMSConfig: mocks.diagnoseSMSConfig,
	generateDiagnosticReport: mocks.generateDiagnosticReport
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: mocks.createSupabaseServerClient
}));

function postRequest(body) {
	return new Request('https://example.com/api/auth/debug-sms-config', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('POST /api/auth/debug-sms-config', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NODE_ENV = 'development';
		mocks.diagnoseSMSConfig.mockReturnValue({ isValid: true });
		mocks.generateDiagnosticReport.mockReturnValue('ok');
	});

	it('rejects non-string phone values before diagnostics or Supabase work', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(postRequest({ testPhoneNumber: 15551234567 }));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('testPhoneNumber must be a non-empty string');
		expect(mocks.diagnoseSMSConfig).not.toHaveBeenCalled();
		expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
	});

	it('rejects whitespace-only phone values before diagnostics or Supabase work', async () => {
		const { POST } = await import('./route.js');
		const response = await POST(postRequest({ testPhoneNumber: '   ' }));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('testPhoneNumber must be a non-empty string');
		expect(mocks.diagnoseSMSConfig).not.toHaveBeenCalled();
		expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
	});
});
