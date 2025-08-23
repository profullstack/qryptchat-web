/**
 * @fileoverview Tests for SMS debug API endpoint
 * Tests the /api/auth/debug-sms endpoint functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST, GET } from '../../../src/routes/api/auth/debug-sms/+server.js';
import { suppressConsole, restoreConsole } from '../../setup.js';

// Mock dependencies
vi.mock('$lib/utils/sms-debug.js', () => ({
	SMSAuthDiagnostics: vi.fn(),
}));

describe('/api/auth/debug-sms endpoint', () => {
	let mockEvent;
	let mockDiagnostics;

	beforeEach(async () => {
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

		// Setup mock diagnostics
		mockDiagnostics = {
			runDiagnostics: vi.fn(),
			testSMSSending: vi.fn(),
			testSMSVerification: vi.fn(),
			logger: {
				getLogs: vi.fn(() => []),
			},
		};

		// Import and setup mocks
		const { SMSAuthDiagnostics } = await import('$lib/utils/sms-debug.js');
		SMSAuthDiagnostics.mockReturnValue(mockDiagnostics);

		suppressConsole();
	});

	afterEach(() => {
		restoreConsole();
	});

	describe('POST endpoint', () => {
		describe('Input validation', () => {
			it('should return 400 when phone number is missing', async () => {
				mockEvent.request.json.mockResolvedValue({});

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toBe('Phone number is required for diagnostics');
			});

			it('should return 400 when phone number is null', async () => {
				mockEvent.request.json.mockResolvedValue({ phoneNumber: null });

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toBe('Phone number is required for diagnostics');
			});

			it('should return 400 for invalid action', async () => {
				mockEvent.request.json.mockResolvedValue({
					phoneNumber: '+1234567890',
					action: 'invalid-action',
				});

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toBe('Invalid action. Use: diagnose, test-send, or test-verify');
			});

			it('should return 400 when verification code is missing for test-verify', async () => {
				mockEvent.request.json.mockResolvedValue({
					phoneNumber: '+1234567890',
					action: 'test-verify',
				});

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toBe('Verification code is required for verify test');
			});
		});

		describe('Diagnose action', () => {
			it('should successfully run diagnostics', async () => {
				const phoneNumber = '+1234567890';
				mockEvent.request.json.mockResolvedValue({
					phoneNumber,
					action: 'diagnose',
				});

				const diagnosticsResult = {
					success: true,
					issues: [],
					logs: ['Log entry 1', 'Log entry 2'],
				};

				mockDiagnostics.runDiagnostics.mockResolvedValue(diagnosticsResult);

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(200);
				expect(data).toEqual(diagnosticsResult);
				expect(mockDiagnostics.runDiagnostics).toHaveBeenCalledWith(phoneNumber);
			});

			it('should handle diagnostics with issues', async () => {
				const phoneNumber = '+1234567890';
				mockEvent.request.json.mockResolvedValue({
					phoneNumber,
					action: 'diagnose',
				});

				const diagnosticsResult = {
					success: false,
					issues: ['Missing environment variable', 'Database connection failed'],
					logs: ['Error log'],
				};

				mockDiagnostics.runDiagnostics.mockResolvedValue(diagnosticsResult);

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(200);
				expect(data.success).toBe(false);
				expect(data.issues).toHaveLength(2);
			});

			it('should default to diagnose action when not specified', async () => {
				const phoneNumber = '+1234567890';
				mockEvent.request.json.mockResolvedValue({ phoneNumber });

				const diagnosticsResult = {
					success: true,
					issues: [],
					logs: [],
				};

				mockDiagnostics.runDiagnostics.mockResolvedValue(diagnosticsResult);

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(200);
				expect(mockDiagnostics.runDiagnostics).toHaveBeenCalledWith(phoneNumber);
			});
		});

		describe('Test-send action', () => {
			it('should successfully test SMS sending', async () => {
				const phoneNumber = '+1234567890';
				mockEvent.request.json.mockResolvedValue({
					phoneNumber,
					action: 'test-send',
				});

				const sendResult = {
					success: true,
					error: null,
				};

				mockDiagnostics.testSMSSending.mockResolvedValue(sendResult);

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(200);
				expect(data.success).toBe(true);
				expect(data.error).toBeUndefined();
				expect(data.logs).toBeDefined();
				expect(mockDiagnostics.testSMSSending).toHaveBeenCalledWith(phoneNumber);
			});

			it('should handle SMS sending failure', async () => {
				const phoneNumber = '+1234567890';
				mockEvent.request.json.mockResolvedValue({
					phoneNumber,
					action: 'test-send',
				});

				const sendResult = {
					success: false,
					error: { message: 'SMS provider not configured' },
				};

				mockDiagnostics.testSMSSending.mockResolvedValue(sendResult);

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(200);
				expect(data.success).toBe(false);
				expect(data.error).toBe('SMS provider not configured');
			});
		});

		describe('Test-verify action', () => {
			it('should successfully test SMS verification', async () => {
				const phoneNumber = '+1234567890';
				const verificationCode = '123456';
				
				// Mock the request to return both phoneNumber and verificationCode
				let callCount = 0;
				mockEvent.request.json.mockImplementation(() => {
					callCount++;
					if (callCount === 1) {
						return Promise.resolve({
							phoneNumber,
							action: 'test-verify',
						});
					} else {
						return Promise.resolve({
							phoneNumber,
							action: 'test-verify',
							verificationCode,
						});
					}
				});

				const verifyResult = {
					success: true,
					error: null,
					data: { user: { id: 'user-123' } },
				};

				mockDiagnostics.testSMSVerification.mockResolvedValue(verifyResult);

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(200);
				expect(data.success).toBe(true);
				expect(data.data.user.id).toBe('user-123');
				expect(mockDiagnostics.testSMSVerification).toHaveBeenCalledWith(phoneNumber, verificationCode);
			});

			it('should handle SMS verification failure', async () => {
				const phoneNumber = '+1234567890';
				const verificationCode = '123456';
				
				let callCount = 0;
				mockEvent.request.json.mockImplementation(() => {
					callCount++;
					if (callCount === 1) {
						return Promise.resolve({
							phoneNumber,
							action: 'test-verify',
						});
					} else {
						return Promise.resolve({
							phoneNumber,
							action: 'test-verify',
							verificationCode,
						});
					}
				});

				const verifyResult = {
					success: false,
					error: { message: 'Invalid verification code' },
					data: null,
				};

				mockDiagnostics.testSMSVerification.mockResolvedValue(verifyResult);

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(200);
				expect(data.success).toBe(false);
				expect(data.error).toBe('Invalid verification code');
			});
		});

		describe('Error handling', () => {
			it('should handle JSON parsing error', async () => {
				mockEvent.request.json.mockRejectedValue(new Error('Invalid JSON'));

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(500);
				expect(data.error).toBe('Internal server error');
				expect(data.details).toBe('Invalid JSON');
			});

			it('should handle diagnostics creation error', async () => {
				mockEvent.request.json.mockResolvedValue({
					phoneNumber: '+1234567890',
					action: 'diagnose',
				});

				const { SMSAuthDiagnostics } = await import('$lib/utils/sms-debug.js');
				SMSAuthDiagnostics.mockImplementation(() => {
					throw new Error('Diagnostics creation failed');
				});

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(500);
				expect(data.error).toBe('Internal server error');
				expect(data.details).toBe('Diagnostics creation failed');
			});

			it('should handle diagnostics execution error', async () => {
				mockEvent.request.json.mockResolvedValue({
					phoneNumber: '+1234567890',
					action: 'diagnose',
				});

				mockDiagnostics.runDiagnostics.mockRejectedValue(new Error('Diagnostics failed'));

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(response.status).toBe(500);
				expect(data.error).toBe('Internal server error');
				expect(data.details).toBe('Diagnostics failed');
			});

			it('should include stack trace in development mode', async () => {
				const originalNodeEnv = process.env.NODE_ENV;
				process.env.NODE_ENV = 'development';

				mockEvent.request.json.mockRejectedValue(new Error('Test error'));

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(data.stack).toBeDefined();

				process.env.NODE_ENV = originalNodeEnv;
			});

			it('should not include stack trace in production mode', async () => {
				const originalNodeEnv = process.env.NODE_ENV;
				process.env.NODE_ENV = 'production';

				mockEvent.request.json.mockRejectedValue(new Error('Test error'));

				const response = await POST(mockEvent);
				const data = await response.json();

				expect(data.stack).toBeUndefined();

				process.env.NODE_ENV = originalNodeEnv;
			});
		});
	});

	describe('GET endpoint', () => {
		it('should return system status successfully', async () => {
			const diagnosticsResult = {
				success: true,
				issues: [],
				logs: ['System check passed'],
			};

			mockDiagnostics.runDiagnostics.mockResolvedValue(diagnosticsResult);

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.systemStatus).toBe('healthy');
			expect(data.environment).toBeDefined();
			expect(data.timestamp).toBeDefined();
			expect(data.checks).toBeDefined();
			expect(data.checks.environment).toBe(true);
			expect(data.checks.supabase).toBe(true);
			expect(data.checks.database).toBe(true);
			expect(data.issues).toEqual([]);
			expect(data.logs).toEqual(['System check passed']);
		});

		it('should return system status with issues detected', async () => {
			const diagnosticsResult = {
				success: false,
				issues: [
					'Missing environment variable',
					'Supabase connection failed',
					'Database table not accessible',
				],
				logs: ['Error in system check'],
			};

			mockDiagnostics.runDiagnostics.mockResolvedValue(diagnosticsResult);

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.systemStatus).toBe('issues_detected');
			expect(data.checks.environment).toBe(false);
			expect(data.checks.supabase).toBe(false);
			expect(data.checks.database).toBe(false);
			expect(data.issues).toHaveLength(3);
		});

		it('should handle GET endpoint errors', async () => {
			mockDiagnostics.runDiagnostics.mockRejectedValue(new Error('System check failed'));

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.systemStatus).toBe('error');
			expect(data.error).toBe('System check failed');
			expect(data.timestamp).toBeDefined();
		});

		it('should handle diagnostics creation error in GET', async () => {
			const { SMSAuthDiagnostics } = await import('$lib/utils/sms-debug.js');
			SMSAuthDiagnostics.mockImplementation(() => {
				throw new Error('Cannot create diagnostics');
			});

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.systemStatus).toBe('error');
			expect(data.error).toBe('Cannot create diagnostics');
		});

		it('should use dummy phone number for format check in GET', async () => {
			const diagnosticsResult = {
				success: true,
				issues: [],
				logs: [],
			};

			mockDiagnostics.runDiagnostics.mockResolvedValue(diagnosticsResult);

			await GET(mockEvent);

			expect(mockDiagnostics.runDiagnostics).toHaveBeenCalledWith('+1234567890');
		});
	});

	describe('Integration scenarios', () => {
		it('should handle complete diagnostic workflow', async () => {
			const phoneNumber = '+1234567890';
			
			// Test diagnose action
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				action: 'diagnose',
			});

			mockDiagnostics.runDiagnostics.mockResolvedValue({
				success: true,
				issues: [],
				logs: ['All checks passed'],
			});

			const diagnoseResponse = await POST(mockEvent);
			const diagnoseData = await diagnoseResponse.json();

			expect(diagnoseResponse.status).toBe(200);
			expect(diagnoseData.success).toBe(true);

			// Test send action
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				action: 'test-send',
			});

			mockDiagnostics.testSMSSending.mockResolvedValue({
				success: true,
				error: null,
			});

			const sendResponse = await POST(mockEvent);
			const sendData = await sendResponse.json();

			expect(sendResponse.status).toBe(200);
			expect(sendData.success).toBe(true);
		});

		it('should handle mixed success/failure scenarios', async () => {
			const phoneNumber = '+1234567890';
			
			// Diagnostics pass but SMS sending fails
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				action: 'diagnose',
			});

			mockDiagnostics.runDiagnostics.mockResolvedValue({
				success: true,
				issues: [],
				logs: [],
			});

			const diagnoseResponse = await POST(mockEvent);
			expect(diagnoseResponse.status).toBe(200);

			// But SMS sending fails
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				action: 'test-send',
			});

			mockDiagnostics.testSMSSending.mockResolvedValue({
				success: false,
				error: { message: 'SMS provider error' },
			});

			const sendResponse = await POST(mockEvent);
			const sendData = await sendResponse.json();

			expect(sendResponse.status).toBe(200);
			expect(sendData.success).toBe(false);
			expect(sendData.error).toBe('SMS provider error');
		});
	});

	describe('Edge cases', () => {
		it('should handle empty request body', async () => {
			mockEvent.request.json.mockResolvedValue({});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Phone number is required for diagnostics');
		});

		it('should handle malformed phone numbers gracefully', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: 'not-a-phone-number',
				action: 'diagnose',
			});

			mockDiagnostics.runDiagnostics.mockResolvedValue({
				success: false,
				issues: ['Invalid phone number format'],
				logs: [],
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(false);
			expect(data.issues).toContain('Invalid phone number format');
		});

		it('should handle concurrent requests', async () => {
			const phoneNumber = '+1234567890';
			
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				action: 'diagnose',
			});

			mockDiagnostics.runDiagnostics.mockResolvedValue({
				success: true,
				issues: [],
				logs: [],
			});

			// Make multiple concurrent requests
			const promises = [
				POST(mockEvent),
				POST(mockEvent),
				POST(mockEvent),
			];

			const responses = await Promise.all(promises);

			responses.forEach(response => {
				expect(response.status).toBe(200);
			});
		});
	});
});