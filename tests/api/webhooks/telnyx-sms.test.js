import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST, GET } from '../../../src/routes/api/webhooks/telnyx/sms/+server.js';

// Mock the service role client
vi.mock('../../../src/lib/supabase/service-role.js', () => ({
	createServiceRoleClient: vi.fn(() => ({
		auth: {
			verifyOtp: vi.fn()
		}
	}))
}));

// Mock fetch for Telnyx API calls
global.fetch = vi.fn();

describe('Telnyx SMS Webhook', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Mock environment variable
		process.env.TELNYX_API_KEY = 'test-api-key';
	});

	afterEach(() => {
		delete process.env.TELNYX_API_KEY;
	});

	describe('GET /api/webhooks/telnyx/sms', () => {
		it('should return health check status', async () => {
			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('healthy');
			expect(data.service).toBe('telnyx-sms-webhook');
			expect(data.timestamp).toBeDefined();
		});
	});

	describe('POST /api/webhooks/telnyx/sms', () => {
		const mockRequest = (body) => ({
			json: vi.fn().mockResolvedValue(body)
		});

		it('should ignore non-message events', async () => {
			const request = mockRequest({
				data: {
					event_type: 'message.sent',
					payload: {}
				}
			});

			const response = await POST({ request });
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('ignored');
			expect(data.reason).toBe('not_message_received_event');
		});

		it('should return error for missing required fields', async () => {
			const request = mockRequest({
				data: {
					event_type: 'message.received',
					payload: {
						from: {},
						text: ''
					}
				}
			});

			const response = await POST({ request });
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Missing required fields');
		});

		it('should ignore invalid OTP format', async () => {
			const request = mockRequest({
				data: {
					event_type: 'message.received',
					payload: {
						id: 'msg-123',
						from: { phone_number: '+1234567890' },
						to: [{ phone_number: '+0987654321' }],
						text: 'invalid-otp'
					}
				}
			});

			const response = await POST({ request });
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('ignored');
			expect(data.reason).toBe('invalid_otp_format');
		});

		it('should handle successful OTP verification', async () => {
			const { createServiceRoleClient } = await import('../../../src/lib/supabase/service-role.js');
			const mockSupabase = createServiceRoleClient();
			
			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: { user: { id: 'user-123' } },
				error: null
			});

			// Mock successful Telnyx response
			global.fetch.mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ id: 'msg-response-123' })
			});

			const request = mockRequest({
				data: {
					event_type: 'message.received',
					payload: {
						id: 'msg-123',
						from: { phone_number: '+1234567890' },
						to: [{ phone_number: '+0987654321' }],
						text: '123456'
					}
				}
			});

			const response = await POST({ request });
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('success');
			expect(data.message).toBe('OTP verified successfully');
			expect(data.userId).toBe('user-123');

			// Verify OTP was called with correct parameters
			expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
				phone: '+1234567890',
				token: '123456',
				type: 'sms'
			});

			// Verify response SMS was sent
			expect(global.fetch).toHaveBeenCalledWith(
				'https://api.telnyx.com/v2/messages',
				expect.objectContaining({
					method: 'POST',
					headers: {
						'Authorization': 'Bearer test-api-key',
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						from: '+0987654321',
						to: '+1234567890',
						text: 'Verification successful! You can now use QryptChat.'
					})
				})
			);
		});

		it('should handle failed OTP verification', async () => {
			const { createServiceRoleClient } = await import('../../../src/lib/supabase/service-role.js');
			const mockSupabase = createServiceRoleClient();
			
			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: null,
				error: { message: 'Invalid OTP' }
			});

			// Mock successful Telnyx response
			global.fetch.mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ id: 'msg-response-123' })
			});

			const request = mockRequest({
				data: {
					event_type: 'message.received',
					payload: {
						id: 'msg-123',
						from: { phone_number: '+1234567890' },
						to: [{ phone_number: '+0987654321' }],
						text: '999999'
					}
				}
			});

			const response = await POST({ request });
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('otp_verification_failed');
			expect(data.error).toBe('Invalid OTP');

			// Verify error response SMS was sent
			expect(global.fetch).toHaveBeenCalledWith(
				'https://api.telnyx.com/v2/messages',
				expect.objectContaining({
					body: JSON.stringify({
						from: '+0987654321',
						to: '+1234567890',
						text: 'Invalid or expired code. Please try again.'
					})
				})
			);
		});

		it('should handle verification exceptions', async () => {
			const { createServiceRoleClient } = await import('../../../src/lib/supabase/service-role.js');
			const mockSupabase = createServiceRoleClient();
			
			mockSupabase.auth.verifyOtp.mockRejectedValue(new Error('Network error'));

			// Mock successful Telnyx response
			global.fetch.mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ id: 'msg-response-123' })
			});

			const request = mockRequest({
				data: {
					event_type: 'message.received',
					payload: {
						id: 'msg-123',
						from: { phone_number: '+1234567890' },
						to: [{ phone_number: '+0987654321' }],
						text: '123456'
					}
				}
			});

			const response = await POST({ request });
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.status).toBe('error');
			expect(data.error).toBe('Verification failed');
		});

		it('should work without Telnyx API key (no response SMS)', async () => {
			delete process.env.TELNYX_API_KEY;

			const { createServiceRoleClient } = await import('../../../src/lib/supabase/service-role.js');
			const mockSupabase = createServiceRoleClient();
			
			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: { user: { id: 'user-123' } },
				error: null
			});

			const request = mockRequest({
				data: {
					event_type: 'message.received',
					payload: {
						id: 'msg-123',
						from: { phone_number: '+1234567890' },
						to: [{ phone_number: '+0987654321' }],
						text: '123456'
					}
				}
			});

			const response = await POST({ request });
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.status).toBe('success');
			
			// Verify no Telnyx API call was made
			expect(global.fetch).not.toHaveBeenCalled();
		});
	});
});