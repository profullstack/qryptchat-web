/**
 * @fileoverview Tests for SMS debugging utilities
 * Tests the SMS debugging and diagnostics functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
	SMSDebugLogger, 
	SMSAuthDiagnostics, 
	formatSMSError, 
	SMS_DEBUG_LEVELS 
} from '../../src/lib/utils/sms-debug.js';
import { suppressConsole, restoreConsole } from '../setup.js';

// Mock Supabase
vi.mock('$lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(),
}));

describe('SMS Debug Utilities', () => {
	beforeEach(() => {
		suppressConsole();
	});

	afterEach(() => {
		restoreConsole();
	});

	describe('SMS_DEBUG_LEVELS', () => {
		it('should have correct debug levels', () => {
			expect(SMS_DEBUG_LEVELS.ERROR).toBe('error');
			expect(SMS_DEBUG_LEVELS.WARN).toBe('warn');
			expect(SMS_DEBUG_LEVELS.INFO).toBe('info');
			expect(SMS_DEBUG_LEVELS.DEBUG).toBe('debug');
		});
	});

	describe('SMSDebugLogger', () => {
		let logger;

		beforeEach(() => {
			logger = new SMSDebugLogger();
		});

		it('should initialize with default level', () => {
			expect(logger.level).toBe(SMS_DEBUG_LEVELS.INFO);
			expect(logger.logs).toEqual([]);
		});

		it('should initialize with custom level', () => {
			const customLogger = new SMSDebugLogger(SMS_DEBUG_LEVELS.DEBUG);
			expect(customLogger.level).toBe(SMS_DEBUG_LEVELS.DEBUG);
		});

		it('should log messages with correct format', () => {
			const message = 'Test message';
			const data = { key: 'value' };

			logger.log(SMS_DEBUG_LEVELS.INFO, message, data);

			const logs = logger.getLogs();
			expect(logs).toHaveLength(1);
			expect(logs[0].level).toBe(SMS_DEBUG_LEVELS.INFO);
			expect(logs[0].message).toBe(message);
			expect(logs[0].data).toBe(JSON.stringify(data, null, 2));
			expect(logs[0].timestamp).toBeDefined();
		});

		it('should log messages without data', () => {
			const message = 'Test message';

			logger.log(SMS_DEBUG_LEVELS.INFO, message);

			const logs = logger.getLogs();
			expect(logs).toHaveLength(1);
			expect(logs[0].data).toBeNull();
		});

		it('should have convenience methods for different levels', () => {
			logger.error('Error message', { error: true });
			logger.warn('Warning message', { warning: true });
			logger.info('Info message', { info: true });
			logger.debug('Debug message', { debug: true });

			const logs = logger.getLogs();
			expect(logs).toHaveLength(4);
			expect(logs[0].level).toBe(SMS_DEBUG_LEVELS.ERROR);
			expect(logs[1].level).toBe(SMS_DEBUG_LEVELS.WARN);
			expect(logs[2].level).toBe(SMS_DEBUG_LEVELS.INFO);
			expect(logs[3].level).toBe(SMS_DEBUG_LEVELS.DEBUG);
		});

		it('should return logs as string', () => {
			logger.info('First message');
			logger.error('Second message', { error: 'details' });

			const logsString = logger.getLogsAsString();
			
			expect(logsString).toContain('INFO: First message');
			expect(logsString).toContain('ERROR: Second message');
			expect(logsString).toContain('"error": "details"');
		});

		it('should handle multiple log entries', () => {
			for (let i = 0; i < 5; i++) {
				logger.info(`Message ${i}`);
			}

			const logs = logger.getLogs();
			expect(logs).toHaveLength(5);
			
			logs.forEach((log, index) => {
				expect(log.message).toBe(`Message ${index}`);
			});
		});
	});

	describe('formatSMSError', () => {
		it('should format basic error', () => {
			const error = new Error('Test error');
			error.status = 400;
			error.code = 'TEST_ERROR';

			const formatted = formatSMSError(error);

			expect(formatted.timestamp).toBeDefined();
			expect(formatted.context).toEqual({});
			expect(formatted.error.message).toBe('Test error');
			expect(formatted.error.code).toBe(400);
			expect(formatted.error.name).toBe('Error');
		});

		it('should format error with context', () => {
			const error = new Error('Test error');
			const context = {
				phoneNumber: '+1234567890',
				action: 'send_sms',
			};

			const formatted = formatSMSError(error, context);

			expect(formatted.context).toEqual(context);
		});

		it('should provide suggestions for specific error types', () => {
			const testCases = [
				{
					message: 'Invalid phone number format',
					expectedSuggestion: 'Ensure phone number is in E.164 format (e.g., +1234567890)',
				},
				{
					message: 'SMS not configured properly',
					expectedSuggestion: 'Configure SMS provider in Supabase Dashboard > Authentication > Providers',
				},
				{
					message: 'Invalid verification code provided',
					expectedSuggestion: 'Check if code has expired or if user entered it correctly',
				},
				{
					message: 'Too many requests made',
					expectedSuggestion: 'Rate limiting is active - wait before retrying',
				},
			];

			testCases.forEach(({ message, expectedSuggestion }) => {
				const error = new Error(message);
				const formatted = formatSMSError(error);
				expect(formatted.suggestion).toBe(expectedSuggestion);
			});
		});

		it('should not provide suggestion for unknown errors', () => {
			const error = new Error('Unknown error');
			const formatted = formatSMSError(error);
			expect(formatted.suggestion).toBeUndefined();
		});

		it('should handle errors without status or code', () => {
			const error = new Error('Simple error');
			const formatted = formatSMSError(error);

			expect(formatted.error.code).toBeUndefined();
			expect(formatted.error.message).toBe('Simple error');
		});
	});

	describe('SMSAuthDiagnostics', () => {
		let diagnostics;
		let mockEvent;
		let mockSupabase;

		beforeEach(async () => {
			mockEvent = {
				request: {
					headers: {
						get: vi.fn(() => 'test-user-agent'),
					},
				},
				getClientAddress: vi.fn(() => '127.0.0.1'),
			};

			mockSupabase = {
				from: vi.fn(() => ({
					select: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
					})),
				})),
			};

			const { createSupabaseServerClient } = await import('$lib/supabase.js');
			createSupabaseServerClient.mockReturnValue(mockSupabase);

			diagnostics = new SMSAuthDiagnostics(mockEvent);
		});

		it('should initialize with event and create logger', () => {
			expect(diagnostics.event).toBe(mockEvent);
			expect(diagnostics.logger).toBeDefined();
			expect(diagnostics.supabase).toBe(mockSupabase);
		});

		describe('Phone number validation', () => {
			it('should validate correct phone number format', () => {
				const issues = [];
				diagnostics.checkPhoneNumberFormat('+1234567890', issues);
				expect(issues).toHaveLength(0);
			});

			it('should detect missing phone number', () => {
				const issues = [];
				diagnostics.checkPhoneNumberFormat(null, issues);
				expect(issues).toHaveLength(1);
				expect(issues[0]).toBe('Phone number is required');
			});

			it('should detect invalid phone number format', () => {
				const invalidNumbers = [
					'1234567890',
					'+0123456789',
					'+123',
					'+123456789012345678',
					'+123abc7890',
				];

				invalidNumbers.forEach(phoneNumber => {
					const issues = [];
					diagnostics.checkPhoneNumberFormat(phoneNumber, issues);
					expect(issues).toHaveLength(1);
					expect(issues[0]).toContain('Invalid phone number format');
				});
			});
		});

		describe('Environment configuration check', () => {
			const originalEnv = process.env;

			beforeEach(() => {
				process.env = { ...originalEnv };
			});

			afterEach(() => {
				process.env = originalEnv;
			});

			it('should pass with all required environment variables', async () => {
				process.env.PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
				process.env.PUBLIC_SUPABASE_ANON_KEY = 'test-key';

				const issues = [];
				await diagnostics.checkEnvironmentConfig(issues);
				expect(issues).toHaveLength(0);
			});

			it('should detect missing environment variables', async () => {
				delete process.env.PUBLIC_SUPABASE_URL;
				delete process.env.PUBLIC_SUPABASE_ANON_KEY;

				const issues = [];
				await diagnostics.checkEnvironmentConfig(issues);
				expect(issues).toHaveLength(2);
				expect(issues[0]).toContain('PUBLIC_SUPABASE_URL');
				expect(issues[1]).toContain('PUBLIC_SUPABASE_ANON_KEY');
			});

			it('should check for service role key in production', async () => {
				process.env.NODE_ENV = 'production';
				process.env.PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
				process.env.PUBLIC_SUPABASE_ANON_KEY = 'test-key';
				delete process.env.SUPABASE_SERVICE_ROLE_KEY;

				const issues = [];
				await diagnostics.checkEnvironmentConfig(issues);
				expect(issues).toHaveLength(1);
				expect(issues[0]).toContain('SUPABASE_SERVICE_ROLE_KEY');
			});
		});

		describe('Database connectivity check', () => {
			it('should pass with accessible tables', async () => {
				mockSupabase.from.mockImplementation((table) => ({
					select: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
					})),
				}));

				const issues = [];
				await diagnostics.checkDatabaseConnectivity(issues);
				expect(issues).toHaveLength(0);
			});

			it('should detect inaccessible tables', async () => {
				mockSupabase.from.mockImplementation((table) => ({
					select: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve({ 
							data: null, 
							error: { message: 'Table not found' } 
						})),
					})),
				}));

				const issues = [];
				await diagnostics.checkDatabaseConnectivity(issues);
				expect(issues.length).toBeGreaterThan(0);
				expect(issues[0]).toContain('not accessible');
			});

			it('should handle database connection errors', async () => {
				mockSupabase.from.mockImplementation(() => {
					throw new Error('Connection failed');
				});

				const issues = [];
				await diagnostics.checkDatabaseConnectivity(issues);
				expect(issues).toHaveLength(1);
				expect(issues[0]).toContain('Database connectivity error');
			});
		});

		describe('Full diagnostics run', () => {
			it('should run all checks successfully', async () => {
				process.env.PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
				process.env.PUBLIC_SUPABASE_ANON_KEY = 'test-key';

				mockSupabase.from.mockImplementation(() => ({
					select: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
					})),
				}));

				const result = await diagnostics.runDiagnostics('+1234567890');

				expect(result.success).toBe(true);
				expect(result.issues).toHaveLength(0);
				expect(result.logs).toBeDefined();
			});

			it('should detect multiple issues', async () => {
				delete process.env.PUBLIC_SUPABASE_URL;
				
				mockSupabase.from.mockImplementation(() => ({
					select: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve({ 
							data: null, 
							error: { message: 'Error' } 
						})),
					})),
				}));

				const result = await diagnostics.runDiagnostics('invalid-phone');

				expect(result.success).toBe(false);
				expect(result.issues.length).toBeGreaterThan(1);
			});

			it('should handle diagnostics exceptions', async () => {
				mockSupabase.from.mockImplementation(() => {
					throw new Error('Unexpected error');
				});

				const result = await diagnostics.runDiagnostics('+1234567890');

				expect(result.success).toBe(false);
				expect(result.issues.length).toBeGreaterThan(0);
				expect(result.issues[0]).toContain('Diagnostics failed');
			});
		});

		describe('SMS testing', () => {
			it('should test SMS sending successfully', async () => {
				const mockAuth = {
					signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
				};
				diagnostics.supabase.auth = mockAuth;

				const result = await diagnostics.testSMSSending('+1234567890');

				expect(result.success).toBe(true);
				expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
					phone: '+1234567890',
					options: {
						channel: 'sms',
						shouldCreateUser: false,
					},
				});
			});

			it('should handle SMS sending errors', async () => {
				const mockAuth = {
					signInWithOtp: vi.fn().mockResolvedValue({ 
						error: { message: 'SMS failed', status: 500 } 
					}),
				};
				diagnostics.supabase.auth = mockAuth;

				const result = await diagnostics.testSMSSending('+1234567890');

				expect(result.success).toBe(false);
				expect(result.error.message).toBe('SMS failed');
			});

			it('should test SMS verification successfully', async () => {
				const mockAuth = {
					verifyOtp: vi.fn().mockResolvedValue({ 
						data: { user: { id: 'user-123' } }, 
						error: null 
					}),
				};
				diagnostics.supabase.auth = mockAuth;

				const result = await diagnostics.testSMSVerification('+1234567890', '123456');

				expect(result.success).toBe(true);
				expect(result.data.user.id).toBe('user-123');
				expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
					phone: '+1234567890',
					token: '123456',
					type: 'sms',
				});
			});

			it('should handle SMS verification errors', async () => {
				const mockAuth = {
					verifyOtp: vi.fn().mockResolvedValue({ 
						data: null, 
						error: { message: 'Invalid code', status: 400 } 
					}),
				};
				diagnostics.supabase.auth = mockAuth;

				const result = await diagnostics.testSMSVerification('+1234567890', '123456');

				expect(result.success).toBe(false);
				expect(result.error.message).toBe('Invalid code');
			});

			it('should handle verification success but no user data', async () => {
				const mockAuth = {
					verifyOtp: vi.fn().mockResolvedValue({ 
						data: { user: null }, 
						error: null 
					}),
				};
				diagnostics.supabase.auth = mockAuth;

				const result = await diagnostics.testSMSVerification('+1234567890', '123456');

				expect(result.success).toBe(false);
				expect(result.error.message).toBe('No user data returned');
			});
		});
	});

	describe('Integration tests', () => {
		it('should work together for complete debugging workflow', async () => {
			const logger = new SMSDebugLogger();
			const error = new Error('SMS not configured');
			
			// Log the error
			logger.error('SMS sending failed', { phoneNumber: '+1234567890' });
			
			// Format the error
			const formattedError = formatSMSError(error, {
				phoneNumber: '+1234567890',
				action: 'send_sms',
			});
			
			// Verify the workflow
			const logs = logger.getLogs();
			expect(logs).toHaveLength(1);
			expect(logs[0].level).toBe(SMS_DEBUG_LEVELS.ERROR);
			
			expect(formattedError.suggestion).toContain('Configure SMS provider');
			expect(formattedError.context.phoneNumber).toBe('+1234567890');
		});
	});
});