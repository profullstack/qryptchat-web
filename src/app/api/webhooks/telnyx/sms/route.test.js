import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createServiceRoleClient: vi.fn(),
	createSMSWebhookEmailService: vi.fn()
}));

vi.mock('@/lib/supabase/service-role.js', () => ({
	createServiceRoleClient: mocks.createServiceRoleClient
}));

vi.mock('@/lib/services/mailgun-email-service.js', () => ({
	createSMSWebhookEmailService: mocks.createSMSWebhookEmailService
}));

function webhookRequest(body) {
	return new Request('https://example.com/api/webhooks/telnyx/sms', {
		method: 'POST',
		headers: {
			'telnyx-signature-ed25519': 'dev-signature',
			'telnyx-timestamp': '1720000000'
		},
		body
	});
}

describe('Telnyx SMS webhook', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		delete process.env.TELNYX_PUBLIC_KEY;
		process.env.NODE_ENV = 'development';
	});

	it('returns 400 for malformed JSON after signature verification', async () => {
		const { POST } = await import('./route.js');

		const response = await POST(webhookRequest('{not-json'));
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON payload');
		expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
		expect(mocks.createSMSWebhookEmailService).not.toHaveBeenCalled();
	});
});
