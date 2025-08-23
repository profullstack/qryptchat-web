/**
 * @fileoverview Tests for SMS verification API endpoint
 * Tests the /api/auth/verify-sms endpoint functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../../src/routes/api/auth/verify-sms/+server.js';
import { suppressConsole, restoreConsole } from '../../setup.js';

// Mock dependencies
vi.mock('$lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(),
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

describe('/api/auth/verify-sms POST endpoint', () => {
	let mockEvent;
	let mockSupabase;
	let mockLogger;

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

		// Setup mock Supabase client
		mockSupabase = {
			auth: {
				verifyOtp: vi.fn(),
			},
			from: vi.fn(() => ({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						single: vi.fn(),
					})),
				})),
				insert: vi.fn(() => ({
					select: vi.fn(() => ({
						single: vi.fn(),
					})),
				})),
			})),
		};

		// Setup mock logger
		mockLogger = {
			info: vi.fn(),
			error: vi.fn(),
			getLogs: vi.fn(() => []),
			getLogsAsString: vi.fn(() => ''),
		};

		// Import and setup mocks
		const { createSupabaseServerClient } = await import('$lib/supabase.js');
		const { SMSDebugLogger } = await import('$lib/utils/sms-debug.js');
		
		createSupabaseServerClient.mockReturnValue(mockSupabase);
		SMSDebugLogger.mockReturnValue(mockLogger);

		suppressConsole();
	});

	afterEach(() => {
		restoreConsole();
	});

	describe('Input validation', () => {
		it('should return 400 when phone number is missing', async () => {
			mockEvent.request.json.mockResolvedValue({
				verificationCode: '123456',
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Phone number and verification code are required');
		});

		it('should return 400 when verification code is missing', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Phone number and verification code are required');
		});

		it('should return 400 when both phone number and verification code are missing', async () => {
			mockEvent.request.json.mockResolvedValue({});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Phone number and verification code are required');
		});

		it('should return 400 for invalid phone number format', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '1234567890',
				verificationCode: '123456',
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid phone number format');
			expect(data.suggestion).toContain('E.164 format');
		});

		it('should return 400 for invalid verification code - not 6 digits', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
				verificationCode: '12345',
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Verification code must be 6 digits');
			expect(data.suggestion).toBe('Enter the 6-digit code you received via SMS');
		});

		it('should return 400 for invalid verification code - contains letters', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
				verificationCode: '12345a',
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Verification code must be 6 digits');
		});

		it('should return 400 for invalid verification code - too long', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
				verificationCode: '1234567',
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Verification code must be 6 digits');
		});
	});

	describe('OTP verification', () => {
		it('should successfully verify OTP for existing user', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				verificationCode,
			});

			// Mock successful OTP verification
			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: {
					user: {
						id: 'user-123',
						phone: phoneNumber,
					},
				},
				error: null,
			});

			// Mock existing user lookup
			const existingUser = {
				id: 'user-123',
				username: 'testuser',
				display_name: 'Test User',
				phone_number: phoneNumber,
				avatar_url: null,
				created_at: '2023-01-01T00:00:00Z',
			};

			mockSupabase.from.mockReturnValue({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						single: vi.fn().mockResolvedValue({
							data: existingUser,
							error: null,
						}),
					})),
				})),
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.user.id).toBe('user-123');
			expect(data.user.username).toBe('testuser');
			expect(data.isNewUser).toBe(false);
			expect(data.message).toBe('Signed in successfully');
		});

		it('should successfully verify OTP and create new user', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'newuser';
			const displayName = 'New User';
			
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				verificationCode,
				username,
				displayName,
			});

			// Mock successful OTP verification
			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: {
					user: {
						id: 'user-456',
						phone: phoneNumber,
					},
				},
				error: null,
			});

			// Mock no existing user found
			mockSupabase.from.mockImplementation((table) => {
				if (table === 'users') {
					return {
						select: vi.fn(() => ({
							eq: vi.fn((field, value) => ({
								single: vi.fn().mockResolvedValue({
									data: null,
									error: { code: 'PGRST116' }, // No rows returned
								}),
							})),
						})),
						insert: vi.fn(() => ({
							select: vi.fn(() => ({
								single: vi.fn().mockResolvedValue({
									data: {
										id: 'user-456',
										username,
										display_name: displayName,
										phone_number: phoneNumber,
										avatar_url: null,
										created_at: '2023-01-01T00:00:00Z',
									},
									error: null,
								}),
							})),
						})),
					};
				}
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.user.username).toBe(username);
			expect(data.user.displayName).toBe(displayName);
			expect(data.isNewUser).toBe(true);
			expect(data.message).toBe('Account created successfully');
		});

		it('should return 400 when username is required for new user but not provided', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				verificationCode,
			});

			// Mock successful OTP verification
			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: {
					user: {
						id: 'user-456',
						phone: phoneNumber,
					},
				},
				error: null,
			});

			// Mock no existing user found
			mockSupabase.from.mockReturnValue({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						single: vi.fn().mockResolvedValue({
							data: null,
							error: { code: 'PGRST116' },
						}),
					})),
				})),
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Username is required for new users');
			expect(data.suggestion).toBe('Please provide a username to create your account');
		});

		it('should return 409 when username is already taken', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'takenuser';
			
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				verificationCode,
				username,
			});

			// Mock successful OTP verification
			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: {
					user: {
						id: 'user-456',
						phone: phoneNumber,
					},
				},
				error: null,
			});

			// Mock no existing user by phone, but username is taken
			let callCount = 0;
			mockSupabase.from.mockReturnValue({
				select: vi.fn(() => ({
					eq: vi.fn((field, value) => ({
						single: vi.fn().mockImplementation(() => {
							callCount++;
							if (callCount === 1) {
								// First call - check by phone number (not found)
								return Promise.resolve({
									data: null,
									error: { code: 'PGRST116' },
								});
							} else {
								// Second call - check by username (found)
								return Promise.resolve({
									data: { id: 'other-user' },
									error: null,
								});
							}
						}),
					})),
				})),
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(409);
			expect(data.error).toBe('Username is already taken');
			expect(data.suggestion).toBe('Please choose a different username');
		});
	});

	describe('OTP verification errors', () => {
		it('should handle expired verification code', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
				verificationCode: '123456',
			});

			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: null,
				error: {
					message: 'Token has expired',
					status: 400,
				},
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Verification code has expired. Please request a new one.');
		});

		it('should handle invalid verification code', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
				verificationCode: '123456',
			});

			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: null,
				error: {
					message: 'Invalid token',
					status: 400,
				},
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid verification code. Please check and try again.');
		});

		it('should handle too many attempts', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
				verificationCode: '123456',
			});

			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: null,
				error: {
					message: 'Too many requests',
					status: 429,
				},
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(429);
			expect(data.error).toBe('Too many attempts. Please wait before trying again.');
		});

		it('should handle verification success but no user data', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
				verificationCode: '123456',
			});

			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: {
					user: null,
				},
				error: null,
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Verification failed - no user data');
			expect(data.code).toBe('NO_USER_DATA');
		});
	});

	describe('Database errors', () => {
		it('should handle user creation database error', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'newuser';
			
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				verificationCode,
				username,
			});

			// Mock successful OTP verification
			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: {
					user: {
						id: 'user-456',
						phone: phoneNumber,
					},
				},
				error: null,
			});

			// Mock database operations
			mockSupabase.from.mockImplementation((table) => {
				if (table === 'users') {
					return {
						select: vi.fn(() => ({
							eq: vi.fn(() => ({
								single: vi.fn().mockResolvedValue({
									data: null,
									error: { code: 'PGRST116' },
								}),
							})),
						})),
						insert: vi.fn(() => ({
							select: vi.fn(() => ({
								single: vi.fn().mockResolvedValue({
									data: null,
									error: {
										message: 'Database error',
										code: 'DB_ERROR',
									},
								}),
							})),
						})),
					};
				}
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe('Failed to create user account');
			expect(data.code).toBe('USER_CREATION_FAILED');
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

		it('should handle unexpected errors', async () => {
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
				verificationCode: '123456',
			});

			const { createSupabaseServerClient } = await import('$lib/supabase.js');
			createSupabaseServerClient.mockImplementation(() => {
				throw new Error('Unexpected error');
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
			
			mockEvent.request.json.mockResolvedValue({
				phoneNumber: '+1234567890',
				verificationCode: '123456',
			});

			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: null,
				error: {
					message: 'Test error',
					status: 400,
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
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				verificationCode: '123456',
			});

			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: {
					user: {
						id: 'user-123',
						phone: phoneNumber,
					},
				},
				error: null,
			});

			mockSupabase.from.mockReturnValue({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						single: vi.fn().mockResolvedValue({
							data: {
								id: 'user-123',
								username: 'testuser',
								display_name: 'Test User',
								phone_number: phoneNumber,
							},
							error: null,
						}),
					})),
				})),
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(data.logs).toBeDefined();
		});
	});

	describe('Logging', () => {
		it('should log request details', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				verificationCode: '123456',
				username: 'testuser',
			});

			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: {
					user: {
						id: 'user-123',
						phone: phoneNumber,
					},
				},
				error: null,
			});

			mockSupabase.from.mockReturnValue({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						single: vi.fn().mockResolvedValue({
							data: {
								id: 'user-123',
								username: 'testuser',
							},
							error: null,
						}),
					})),
				})),
			});

			await POST(mockEvent);

			expect(mockLogger.info).toHaveBeenCalledWith('SMS verification request received', {
				phoneNumber: '+12***90',
				hasCode: true,
				codeLength: 6,
				hasUsername: true,
				userAgent: 'test-user-agent',
				ip: '127.0.0.1',
			});
		});

		it('should log verification success', async () => {
			const phoneNumber = '+1234567890';
			mockEvent.request.json.mockResolvedValue({
				phoneNumber,
				verificationCode: '123456',
			});

			mockSupabase.auth.verifyOtp.mockResolvedValue({
				data: {
					user: {
						id: 'user-123',
						phone: phoneNumber,
					},
				},
				error: null,
			});

			mockSupabase.from.mockReturnValue({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						single: vi.fn().mockResolvedValue({
							data: {
								id: 'user-123',
								username: 'testuser',
							},
							error: null,
						}),
					})),
				})),
			});

			await POST(mockEvent);

			expect(mockLogger.info).toHaveBeenCalledWith('OTP verification successful', {
				supabaseUserId: 'user-123',
				userPhone: phoneNumber,
			});
		});
	});
});