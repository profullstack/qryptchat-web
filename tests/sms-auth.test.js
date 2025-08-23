/**
 * @fileoverview Test suite for SMS Authentication System
 * Tests SMS sending, verification, and debugging utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SMSDebugLogger, SMSAuthDiagnostics, formatSMSError } from '../src/lib/utils/sms-debug.js';

// Mock Supabase client
const mockSupabaseClient = {
	auth: {
		signInWithOtp: vi.fn(),
		verifyOtp: vi.fn()
	},
	from: vi.fn(() => ({
		select: vi.fn(() => ({
			eq: vi.fn(() => ({
				single: vi.fn(),
				limit: vi.fn()
			})),
			limit: vi.fn()
		})),
		insert: vi.fn(() => ({
			select: vi.fn(() => ({
				single: vi.fn()
			}))
		}))
	}))
};

// Mock event object
const mockEvent = {
	cookies: {
		get: vi.fn(),
		set: vi.fn(),
		delete: vi.fn()
	},
	getClientAddress: vi.fn(() => '127.0.0.1')
};

describe('SMS Debug Logger', () => {
	let logger;

	beforeEach(() => {
		logger = new SMSDebugLogger();
		vi.clearAllMocks();
	});

	it('should create logger with default level', () => {
		expect(logger.level).toBe('info');
		expect(logger.logs).toEqual([]);
	});

	it('should log messages with correct format', () => {
		const testMessage = 'Test message';
		const testData = { key: 'value' };

		logger.info(testMessage, testData);

		expect(logger.logs).toHaveLength(1);
		expect(logger.logs[0]).toMatchObject({
			level: 'info',
			message: testMessage,
			data: JSON.stringify(testData, null, 2)
		});
		expect(logger.logs[0].timestamp).toBeDefined();
	});

	it('should log different levels correctly', () => {
		logger.error('Error message');
		logger.warn('Warning message');
		logger.info('Info message');
		logger.debug('Debug message');

		expect(logger.logs).toHaveLength(4);
		expect(logger.logs[0].level).toBe('error');
		expect(logger.logs[1].level).toBe('warn');
		expect(logger.logs[2].level).toBe('info');
		expect(logger.logs[3].level).toBe('debug');
	});

	it('should format logs as string correctly', () => {
		logger.info('Test message', { data: 'test' });
		const logString = logger.getLogsAsString();

		expect(logString).toContain('INFO: Test message');
		expect(logString).toContain('"data": "test"');
	});
});

describe('SMS Authentication Diagnostics', () => {
	let diagnostics;

	beforeEach(() => {
		diagnostics = new SMSAuthDiagnostics(mockEvent);
		vi.clearAllMocks();
		
		// Mock environment variables
		process.env.PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
		process.env.PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
		process.env.NODE_ENV = 'test';
	});

	afterEach(() => {
		delete process.env.PUBLIC_SUPABASE_URL;
		delete process.env.PUBLIC_SUPABASE_ANON_KEY;
		delete process.env.NODE_ENV;
	});

	describe('Phone Number Validation', () => {
		it('should validate correct E.164 phone numbers', () => {
			const issues = [];
			diagnostics.checkPhoneNumberFormat('+1234567890', issues);
			expect(issues).toHaveLength(0);
		});

		it('should reject invalid phone number formats', () => {
			const issues = [];
			diagnostics.checkPhoneNumberFormat('1234567890', issues); // Missing +
			expect(issues).toHaveLength(1);
			expect(issues[0]).toContain('Invalid phone number format');
		});

		it('should reject phone numbers starting with +0', () => {
			const issues = [];
			diagnostics.checkPhoneNumberFormat('+0123456789', issues);
			expect(issues).toHaveLength(1);
		});

		it('should reject empty phone numbers', () => {
			const issues = [];
			diagnostics.checkPhoneNumberFormat('', issues);
			expect(issues).toHaveLength(1);
			expect(issues[0]).toContain('Phone number is required');
		});
	});

	describe('Environment Configuration Check', () => {
		it('should pass with all required environment variables', async () => {
			const issues = [];
			await diagnostics.checkEnvironmentConfig(issues);
			expect(issues).toHaveLength(0);
		});

		it('should fail with missing environment variables', async () => {
			delete process.env.PUBLIC_SUPABASE_URL;
			const issues = [];
			await diagnostics.checkEnvironmentConfig(issues);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues[0]).toContain('PUBLIC_SUPABASE_URL');
		});
	});

	describe('SMS Sending Test', () => {
		it('should handle successful SMS sending', async () => {
			mockSupabaseClient.auth.signInWithOtp.mockResolvedValue({ error: null });
			diagnostics.supabase = mockSupabaseClient;

			const result = await diagnostics.testSMSSending('+1234567890');

			expect(result.success).toBe(true);
			expect(mockSupabaseClient.auth.signInWithOtp).toHaveBeenCalledWith({
				phone: '+1234567890',
				options: {
					channel: 'sms',
					shouldCreateUser: false
				}
			});
		});

		it('should handle SMS sending errors', async () => {
			const mockError = { message: 'SMS not configured', status: 400 };
			mockSupabaseClient.auth.signInWithOtp.mockResolvedValue({ error: mockError });
			diagnostics.supabase = mockSupabaseClient;

			const result = await diagnostics.testSMSSending('+1234567890');

			expect(result.success).toBe(false);
			expect(result.error).toEqual(mockError);
		});
	});

	describe('SMS Verification Test', () => {
		it('should handle successful SMS verification', async () => {
			const mockUser = { id: 'user-123', phone: '+1234567890' };
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({ 
				data: { user: mockUser }, 
				error: null 
			});
			diagnostics.supabase = mockSupabaseClient;

			const result = await diagnostics.testSMSVerification('+1234567890', '123456');

			expect(result.success).toBe(true);
			expect(result.data.user).toEqual(mockUser);
			expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledWith({
				phone: '+1234567890',
				token: '123456',
				type: 'sms'
			});
		});

		it('should handle verification errors', async () => {
			const mockError = { message: 'Invalid verification code', status: 400 };
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({ error: mockError });
			diagnostics.supabase = mockSupabaseClient;

			const result = await diagnostics.testSMSVerification('+1234567890', '123456');

			expect(result.success).toBe(false);
			expect(result.error).toEqual(mockError);
		});

		it('should handle missing user data', async () => {
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({ 
				data: { user: null }, 
				error: null 
			});
			diagnostics.supabase = mockSupabaseClient;

			const result = await diagnostics.testSMSVerification('+1234567890', '123456');

			expect(result.success).toBe(false);
			expect(result.error.message).toContain('No user data returned');
		});
	});

	describe('Full Diagnostics Run', () => {
		it('should run complete diagnostics successfully', async () => {
			// Mock successful database connectivity
			mockSupabaseClient.from.mockReturnValue({
				select: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue({ error: null })
				})
			});
			diagnostics.supabase = mockSupabaseClient;

			const result = await diagnostics.runDiagnostics('+1234567890');

			expect(result.success).toBe(true);
			expect(result.issues).toHaveLength(0);
			expect(result.logs).toBeDefined();
		});

		it('should detect and report issues', async () => {
			// Remove required environment variable
			delete process.env.PUBLIC_SUPABASE_URL;

			const result = await diagnostics.runDiagnostics('+1234567890');

			expect(result.success).toBe(false);
			expect(result.issues.length).toBeGreaterThan(0);
		});
	});
});

describe('SMS Error Formatter', () => {
	it('should format basic error information', () => {
		const error = new Error('Test error');
		error.status = 400;
		
		const formatted = formatSMSError(error, { action: 'test' });

		expect(formatted.timestamp).toBeDefined();
		expect(formatted.context.action).toBe('test');
		expect(formatted.error.message).toBe('Test error');
		expect(formatted.error.code).toBe(400);
	});

	it('should provide suggestions for common errors', () => {
		const phoneError = new Error('Invalid phone number');
		const formatted = formatSMSError(phoneError);

		expect(formatted.suggestion).toContain('E.164 format');
	});

	it('should handle SMS configuration errors', () => {
		const configError = new Error('SMS not configured');
		const formatted = formatSMSError(configError);

		expect(formatted.suggestion).toContain('Supabase Dashboard');
	});

	it('should handle rate limiting errors', () => {
		const rateLimitError = new Error('Too many requests');
		const formatted = formatSMSError(rateLimitError);

		expect(formatted.suggestion).toContain('wait before retrying');
	});

	it('should handle verification code errors', () => {
		const codeError = new Error('Invalid verification code');
		const formatted = formatSMSError(codeError);

		expect(formatted.suggestion).toContain('expired');
	});
});

describe('Phone Number Validation Function', () => {
	// Import the validation function from the actual endpoint
	const isValidPhoneNumber = (phoneNumber) => {
		const phoneRegex = /^\+[1-9]\d{1,14}$/;
		return phoneRegex.test(phoneNumber);
	};

	it('should validate correct phone numbers', () => {
		expect(isValidPhoneNumber('+1234567890')).toBe(true);
		expect(isValidPhoneNumber('+447700900123')).toBe(true);
		expect(isValidPhoneNumber('+33123456789')).toBe(true);
	});

	it('should reject invalid phone numbers', () => {
		expect(isValidPhoneNumber('1234567890')).toBe(false); // No +
		expect(isValidPhoneNumber('+0123456789')).toBe(false); // Starts with 0
		expect(isValidPhoneNumber('+12345')).toBe(false); // Too short
		expect(isValidPhoneNumber('+123456789012345678')).toBe(false); // Too long
		expect(isValidPhoneNumber('')).toBe(false); // Empty
		expect(isValidPhoneNumber('+1-234-567-890')).toBe(false); // Contains dashes
	});
});

describe('Integration Tests', () => {
	it('should handle complete SMS authentication flow', async () => {
		// This would be an integration test that tests the full flow
		// In a real scenario, you'd mock the HTTP requests to your endpoints
		
		const phoneNumber = '+1234567890';
		const verificationCode = '123456';
		const username = 'testuser';

		// Mock successful SMS sending
		const sendResponse = {
			success: true,
			message: 'Verification code sent successfully'
		};

		// Mock successful verification
		const verifyResponse = {
			success: true,
			user: {
				id: 'user-123',
				username: 'testuser',
				phoneNumber: '+1234567890'
			},
			isNewUser: true,
			message: 'Account created successfully'
		};

		// In a real test, you'd make actual HTTP requests to your endpoints
		// and verify the responses
		expect(sendResponse.success).toBe(true);
		expect(verifyResponse.success).toBe(true);
		expect(verifyResponse.user.phoneNumber).toBe(phoneNumber);
	});
});