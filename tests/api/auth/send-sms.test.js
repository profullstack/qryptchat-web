/**
 * @fileoverview Tests for SMS send API endpoint
 * Tests the /api/auth/send-sms endpoint functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../../src/routes/api/auth/send-sms/+server.js';
import { mockApiSuccess, mockApiError, suppressConsole, restoreConsole } from '../../setup.js';

// Mock dependencies
vi.mock('$lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(() => ({
		auth: {
			signInWithOtp: vi.fn(),
		},
	})),
}));

vi.mock('$lib/utils/sms-debug.js', () => ({
	SMSDebugLogger: vi.fn(() => ({
		info: vi.fn(),
		error: vi.fn(),
		getLogs: vi.fn(() => []),
		getLogsAsString: vi.fn(() => ''),
	})),
	formatSMSError: vi.fn((error, context) => ({
		timestamp: new Date().toISOString(),
		context,
		error: {
			message: error.message,
			code: error.status || error.code,
			name: error.name,
		},
	})),
}));

describe('/api/auth/send-sms POST endpoint', () => {
	let mockEvent;
	let mockSupabase;
	let mockLogger;

	beforeEach(() => {
		// Setup mock event object
		mockEvent = {
			request: {
				json: vi.fn(),
				headers: {
					get: vi.fn(() => 'test-user-agent'),
				},
			},
			getClientAddress: vi.fn(() => '127.0.0.1'),
		};

		// Setup mock Supabase client
		mockSupabase = {
			auth: {
				signInWithOtp: vi.fn(),
			},
		};

		// Setup mock logger
		mockLogger = {
			info: vi.fn(),
			error: vi.fn(),
			getLogs: vi.fn(() => []),
			getLogsAsString: vi.fn(() => ''),
		};

		// Import mocks
		const { createSupabaseServerClient } = await import('$lib/supabase.js');
		const { SMSDebugLogger } = await import('$lib/utils/sms-debug.js');
		
		vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase);
		vi.mocked(SMSDebugLogger).mockReturnValue(mockLogger);

		suppressConsole();
	});

	afterEach(() => {
		restoreConsole();
	});

	describe('Input validation', () => {
		it('should return 400 when phone number is missing', async () => {
			mockEvent.request.json.mockResolvedValue({});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Phone number is required');
		});

		it('should return 400 when phone number is null', async () => {
			mockEvent.request.json.mockResolvedValue({ phoneNumber: null });

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Phone number is required');
		});

		it('should return 400 when phone number is empty string', async () => {
			mockEvent.request.json.mockResolvedValue({ phoneNumber: '' });

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Phone number is required');
		});

		it('should return 400 for invalid phone number format - no plus sign', async () => {
			mockEvent.request.json.mockResolvedValue({ phoneNumber: '1234567890' });

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid phone number format');
			expect(data.suggestion).toContain('E.164 format');
		});

		it('should return 400 for invalid phone number format - starts with +0', async () => {
			mockEvent.request.json.mockResolvedValue({ phoneNumber: '+0123456789' });

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid phone number format');
		});

		it('should return 400 for invalid phone number format - too short', async () => {
			mockEvent.request.json.mockResolvedValue({ phoneNumber: '+123' });

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid phone number format');
		});

		it('should return 400 for invalid phone number format - too long', async () => {
			mockEvent.request.json.mockResolvedValue({ phoneNumber: '+123456789012345678' });

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid phone number format');
		});

		it('should return 400 for invalid phone number format - contains letters', async () => {
			mockEvent.request.json.mockResolvedValue({ phoneNumber: '+123abc7890' });

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid phone number format');
		});
	});

	describe('Valid phone number formats', () => {
		const validPhoneNumbers = [
			'+1234567890',
			'+12345678901',
			'+123456789012345',
			'+447700900123',
			'+33123456789',
		];

		validPhoneNumbers.forEach((phoneNumber) => {
			it(`should accept valid phone number: ${phoneNumber}`, async () => {
				mockEvent.request.json.mockResolvedValue({ phoneNumber });
				mockSupabase.auth.signInWithOtp.mockResolvedValue({ error: null });

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(200);
				expect(data.success).toBe(true);
				expect(mockSupabase.auth.signInWithOtp).toHaveBeenCalledWith({
					phone: phoneNumber,
					options: {
						channel: 'sms',
						shouldCreateUser: false,
					},
				});
			});
		});
	});

	describe('SMS sending', () => {
		it('should successfully send SMS for valid phone number', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({ error: null });

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.message).toBe('Verification code sent successfully');
			expect(mockSupabase.auth.signInWithOtp).toHaveBeenCalledWith({
				phone: phoneNumber,
				options: {
					channel: 'sms',
					shouldCreateUser: false,
				},
			});
		});

		it('should handle Supabase SMS error - invalid phone number', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({
				error: {
					message: 'Invalid phone number',
					status: 400,
				},
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe('Invalid phone number. Please check the format and try again.');
			expect(data.code).toBe(400);
		});

		it('should handle Supabase SMS error - SMS not configured', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({
				error: {
					message: 'SMS not configured',
					status: 500,
				},
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe('SMS service is temporarily unavailable. Please try again later.');
		});

		it('should handle Supabase SMS error - too many requests', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({
				error: {
					message: 'Too many requests',
					status: 429,
				},
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(429);
			expect(data.error).toBe('Too many attempts. Please wait a few minutes before trying again.');
		});

		it('should handle generic Supabase SMS error', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({
				error: {
					message: 'Unknown error',
					status: 500,
				},
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe('Failed to send SMS. Please try again.');
			expect(data.code).toBe(500);
		});
	});

	describe('Error handling', () => {
		it('should handle JSON parsing error', async () => {
			mockEvent.request.json.mockRejectedValue(new Error('Invalid JSON'));

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe('Internal server error');
			expect(data.code).toBe('INTERNAL_ERROR');
		});

		it('should handle Supabase client creation error', async () => {
			mockEvent.request.json.mockResolvedValue({ phoneNumber: '+1234567890' });
			
			const { createSupabaseServerClient } = await import('$lib/supabase.js');
			createSupabaseServerClient.mockImplementation(() => {
				throw new Error('Supabase connection failed');
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe('Internal server error');
			expect(data.code).toBe('INTERNAL_ERROR');
		});
	});

	describe('Development mode features', () => {
		const originalNodeEnv = process.env.NODE_ENV;

		afterEach(() => {
			process.env.NODE_ENV = originalNodeEnv;
		});

		it('should include debug info in development mode on error', async () => {
			process.env.NODE_ENV = 'development';
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({
				error: {
					message: 'Test error',
					status: 500,
				},
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(data.debug).toBeDefined();
			expect(data.logs).toBeDefined();
		});

		it('should include logs in development mode on success', async () => {
			process.env.NODE_ENV = 'development';
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({ error: null });

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(data.logs).toBeDefined();
		});

		it('should not include debug info in production mode', async () => {
			process.env.NODE_ENV = 'production';
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({
				error: {
					message: 'Test error',
					status: 500,
				},
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(data.debug).toBeUndefined();
			expect(data.logs).toBeUndefined();
		});
	});

	describe('Logging', () => {
		it('should log request details', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({ error: null });

			await POST(mockEvent);

			expect(mockLogger.info).toHaveBeenCalledWith('SMS send request received', {
				phoneNumber: '+12***90',
				userAgent: 'test-user-agent',
				ip: '127.0.0.1',
			});
		});

		it('should log success', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			mockSupabase.auth.signInWithOtp.mockResolvedValue({ error: null });

			await POST(mockEvent);

			expect(mockLogger.info).toHaveBeenCalledWith('SMS sent successfully');
		});

		it('should log errors', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({ phoneNumber });
			const error = {
				message: 'Test error',
				status: 500,
			};
			mockSupabase.auth.signInWithOtp.mockResolvedValue({ error });

			await POST(mockEvent);

			expect(mockLogger.error).toHaveBeenCalledWith('SMS sending failed', expect.any(Object));
		});
	});
});