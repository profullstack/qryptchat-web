import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createSupabaseServerClient: vi.fn(),
	applyRateLimit: vi.fn(),
	applyRateLimitForKey: vi.fn(),
	checkDestination: vi.fn(),
	formatSMSError: vi.fn((error) => ({ message: error.message })),
	getSMSErrorDetails: vi.fn(() => ({}))
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: mocks.createSupabaseServerClient
}));

vi.mock('@/lib/utils/sms-debug.js', () => ({
	SMSDebugLogger: vi.fn(function SMSDebugLogger() {
		this.info = vi.fn();
		this.error = vi.fn();
		this.getLogs = vi.fn(() => []);
		this.getLogsAsString = vi.fn(() => '');
	}),
	formatSMSError: mocks.formatSMSError
}));

vi.mock('@/lib/utils/twilio-validator.js', () => ({
	getSMSErrorDetails: mocks.getSMSErrorDetails
}));

vi.mock('@/lib/server/rate-limiter.js', () => ({
	applyRateLimit: mocks.applyRateLimit,
	applyRateLimitForKey: mocks.applyRateLimitForKey,
	authRateLimiter: {},
	smsPerPhoneLimiter: {},
	smsGlobalHourlyLimiter: {},
	smsGlobalDailyLimiter: {}
}));

vi.mock('@/lib/server/sms-geo.js', () => ({
	checkDestination: mocks.checkDestination
}));

describe('POST /api/auth/send-sms', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.applyRateLimit.mockReturnValue(null);
		mocks.applyRateLimitForKey.mockReturnValue(null);
		mocks.checkDestination.mockReturnValue({ blocked: false, callingCode: '1' });
	});

	it('returns 400 for malformed JSON before SMS cost controls or Supabase work', async () => {
		const { POST } = await import('./route.js');
		const response = await POST({
			headers: new Headers(),
			json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
		expect(mocks.applyRateLimit).toHaveBeenCalledTimes(1);
		expect(mocks.applyRateLimitForKey).not.toHaveBeenCalled();
		expect(mocks.checkDestination).not.toHaveBeenCalled();
		expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
	});
});
