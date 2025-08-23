/**
 * @fileoverview Tests for improved SMS verification error handling
 * Tests the enhanced error messages and user guidance for OTP verification failures
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSupabaseServerClient } from '$lib/supabase.js';

describe('SMS Verification Error Handling', () => {
	let mockSupabaseClient;
	let mockRequest;
	let mockEvent;

	beforeEach(() => {
		// Mock Supabase client
		mockSupabaseClient = {
			auth: {
				verifyOtp: vi.fn()
			}
		};

		// Mock request
		mockRequest = {
			json: vi.fn(),
			headers: {
				get: vi.fn().mockReturnValue('test-user-agent')
			}
		};

		// Mock event
		mockEvent = {
			request: mockRequest,
			getClientAddress: vi.fn().mockReturnValue('127.0.0.1')
		};

		// Mock createSupabaseServerClient
		vi.mock('$lib/supabase.js', () => ({
			createSupabaseServerClient: vi.fn(() => mockSupabaseClient)
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should handle expired OTP with specific error message', async () => {
		// Mock expired OTP error
		mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
			data: null,
			error: {
				message: 'Token has expired or is invalid',
				status: 403
			}
		});

		mockRequest.json.mockResolvedValue({
			phoneNumber: '+1234567890',
			verificationCode: '123456'
		});

		// Import the POST function dynamically to use mocked dependencies
		const { POST } = await import('../../../src/routes/api/auth/verify-sms/+server.js');
		const response = await POST(mockEvent);
		const responseData = await response.json();

		expect(response.status).toBe(400);
		expect(responseData.error).toBe('The verification code is incorrect or has expired');
		expect(responseData.code).toBe('CODE_INVALID_OR_EXPIRED');
		expect(responseData.canRetry).toBe(false);
		expect(responseData.suggestedAction).toBe('Please check the code or request a new one');
	});

	it('should handle rate limiting with appropriate error message', async () => {
		// Mock rate limit error
		mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
			data: null,
			error: {
				message: 'Too many requests',
				status: 429
			}
		});

		mockRequest.json.mockResolvedValue({
			phoneNumber: '+1234567890',
			verificationCode: '123456'
		});

		const { POST } = await import('../../../src/routes/api/auth/verify-sms/+server.js');
		const response = await POST(mockEvent);
		const responseData = await response.json();

		expect(response.status).toBe(429);
		expect(responseData.error).toBe('Too many verification attempts');
		expect(responseData.code).toBe('TOO_MANY_ATTEMPTS');
		expect(responseData.canRetry).toBe(false);
		expect(responseData.suggestedAction).toBe('Please wait a few minutes before trying again');
	});

	it('should handle invalid OTP with clear guidance', async () => {
		// Mock invalid OTP error
		mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
			data: null,
			error: {
				message: 'invalid token',
				status: 400
			}
		});

		mockRequest.json.mockResolvedValue({
			phoneNumber: '+1234567890',
			verificationCode: '123456'
		});

		const { POST } = await import('../../../src/routes/api/auth/verify-sms/+server.js');
		const response = await POST(mockEvent);
		const responseData = await response.json();

		expect(response.status).toBe(400);
		expect(responseData.error).toBe('The verification code is incorrect or has expired');
		expect(responseData.code).toBe('CODE_INVALID_OR_EXPIRED');
		expect(responseData.canRetry).toBe(false);
		expect(responseData.suggestedAction).toBe('Please check the code or request a new one');
	});

	it('should handle generic errors with fallback message', async () => {
		// Mock generic error
		mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
			data: null,
			error: {
				message: 'Unknown error occurred',
				status: 500
			}
		});

		mockRequest.json.mockResolvedValue({
			phoneNumber: '+1234567890',
			verificationCode: '123456'
		});

		const { POST } = await import('../../../src/routes/api/auth/verify-sms/+server.js');
		const response = await POST(mockEvent);
		const responseData = await response.json();

		expect(response.status).toBe(400);
		expect(responseData.error).toBe('Invalid verification code');
		expect(responseData.code).toBe('VERIFICATION_FAILED');
		expect(responseData.canRetry).toBe(true);
		expect(responseData.suggestedAction).toBe('Please try again');
	});

	it('should provide debug information in development mode', async () => {
		// Set NODE_ENV to development
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = 'development';

		mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
			data: null,
			error: {
				message: 'Token has expired or is invalid',
				status: 403
			}
		});

		mockRequest.json.mockResolvedValue({
			phoneNumber: '+1234567890',
			verificationCode: '123456'
		});

		const { POST } = await import('../../../src/routes/api/auth/verify-sms/+server.js');
		const response = await POST(mockEvent);
		const responseData = await response.json();

		expect(responseData.debug).toBeDefined();
		expect(responseData.logs).toBeDefined();

		// Restore original NODE_ENV
		process.env.NODE_ENV = originalEnv;
	});
});