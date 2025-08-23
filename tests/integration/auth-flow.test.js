/**
 * @fileoverview Integration tests for complete authentication flow
 * Tests the end-to-end SMS authentication process
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { mockApiSuccess, mockApiError, suppressConsole, restoreConsole } from '../setup.js';

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true,
}));

// Mock Supabase client
vi.mock('$lib/supabase.js', () => ({
	createSupabaseClient: vi.fn(() => ({
		auth: {
			signOut: vi.fn(),
		},
	})),
}));

describe('Authentication Flow Integration Tests', () => {
	let auth, user, isAuthenticated;

	beforeEach(async () => {
		// Clear localStorage
		window.localStorage.clear();
		
		// Reset fetch mock
		global.fetch.mockClear();

		// Import auth store after mocks are set up
		const authModule = await import('../../src/lib/stores/auth.js');
		auth = authModule.auth;
		user = authModule.user;
		isAuthenticated = authModule.isAuthenticated;

		suppressConsole();
	});

	afterEach(() => {
		restoreConsole();
	});

	describe('Complete SMS Authentication Flow', () => {
		it('should complete full authentication flow for new user', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'testuser';
			const displayName = 'Test User';

			// Step 1: Send SMS
			mockApiSuccess({
				success: true,
				message: 'Verification code sent successfully',
			});

			const sendResult = await auth.sendSMS(phoneNumber);
			
			expect(sendResult.success).toBe(true);
			expect(global.fetch).toHaveBeenCalledWith('/api/auth/send-sms', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ phoneNumber }),
			});

			// Verify user is not authenticated yet
			expect(get(isAuthenticated)).toBe(false);
			expect(get(user)).toBeNull();

			// Step 2: Verify SMS and create user
			const newUser = {
				id: 'user-123',
				username,
				displayName,
				phoneNumber,
				avatarUrl: null,
				createdAt: '2023-01-01T00:00:00Z',
			};

			mockApiSuccess({
				success: true,
				user: newUser,
				isNewUser: true,
				message: 'Account created successfully',
			});

			const verifyResult = await auth.verifySMS(phoneNumber, verificationCode, username, displayName);

			expect(verifyResult.success).toBe(true);
			expect(verifyResult.user).toEqual(newUser);
			expect(verifyResult.isNewUser).toBe(true);

			expect(global.fetch).toHaveBeenCalledWith('/api/auth/verify-sms', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					phoneNumber,
					verificationCode,
					username,
					displayName,
				}),
			});

			// Verify user is now authenticated
			expect(get(isAuthenticated)).toBe(true);
			expect(get(user)).toEqual(newUser);

			// Verify user is stored in localStorage
			const storedUser = JSON.parse(window.localStorage.getItem('qrypt_user'));
			expect(storedUser).toEqual(newUser);
		});

		it('should complete full authentication flow for existing user', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';

			// Step 1: Send SMS
			mockApiSuccess({
				success: true,
				message: 'Verification code sent successfully',
			});

			const sendResult = await auth.sendSMS(phoneNumber);
			expect(sendResult.success).toBe(true);

			// Step 2: Verify SMS for existing user
			const existingUser = {
				id: 'user-456',
				username: 'existinguser',
				displayName: 'Existing User',
				phoneNumber,
				avatarUrl: 'https://example.com/avatar.jpg',
				createdAt: '2022-01-01T00:00:00Z',
			};

			mockApiSuccess({
				success: true,
				user: existingUser,
				isNewUser: false,
				message: 'Signed in successfully',
			});

			const verifyResult = await auth.verifySMS(phoneNumber, verificationCode);

			expect(verifyResult.success).toBe(true);
			expect(verifyResult.user).toEqual(existingUser);
			expect(verifyResult.isNewUser).toBe(false);

			// Verify user is authenticated
			expect(get(isAuthenticated)).toBe(true);
			expect(get(user)).toEqual(existingUser);
		});

		it('should handle SMS sending failure gracefully', async () => {
			const phoneNumber = '+1234567890';
			const errorMessage = 'SMS service temporarily unavailable';

			mockApiError(errorMessage, 503);

			const sendResult = await auth.sendSMS(phoneNumber);

			expect(sendResult.success).toBe(false);
			expect(sendResult.error).toBe(errorMessage);

			// Verify user remains unauthenticated
			expect(get(isAuthenticated)).toBe(false);
			expect(get(user)).toBeNull();

			// Verify error state is set
			const authState = get(auth);
			expect(authState.error).toBe(errorMessage);
			expect(authState.loading).toBe(false);
		});

		it('should handle verification failure after successful SMS send', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';

			// Step 1: Send SMS successfully
			mockApiSuccess({
				success: true,
				message: 'Verification code sent successfully',
			});

			const sendResult = await auth.sendSMS(phoneNumber);
			expect(sendResult.success).toBe(true);

			// Step 2: Verification fails
			const errorMessage = 'Invalid verification code';
			mockApiError(errorMessage, 400);

			const verifyResult = await auth.verifySMS(phoneNumber, verificationCode);

			expect(verifyResult.success).toBe(false);
			expect(verifyResult.error).toBe(errorMessage);

			// Verify user remains unauthenticated
			expect(get(isAuthenticated)).toBe(false);
			expect(get(user)).toBeNull();

			// Verify error state is set
			const authState = get(auth);
			expect(authState.error).toBe(errorMessage);
		});

		it('should handle username already taken error', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'takenusername';

			// Step 1: Send SMS successfully
			mockApiSuccess({
				success: true,
				message: 'Verification code sent successfully',
			});

			await auth.sendSMS(phoneNumber);

			// Step 2: Verification fails due to username conflict
			const errorMessage = 'Username is already taken';
			mockApiError(errorMessage, 409);

			const verifyResult = await auth.verifySMS(phoneNumber, verificationCode, username);

			expect(verifyResult.success).toBe(false);
			expect(verifyResult.error).toBe(errorMessage);

			// Verify user remains unauthenticated
			expect(get(isAuthenticated)).toBe(false);
			expect(get(user)).toBeNull();
		});
	});

	describe('Session Management', () => {
		it('should restore user session from localStorage on init', () => {
			const storedUser = {
				id: 'user-789',
				username: 'storeduser',
				displayName: 'Stored User',
				phoneNumber: '+1234567890',
			};

			window.localStorage.setItem('qrypt_user', JSON.stringify(storedUser));

			auth.init();

			expect(get(isAuthenticated)).toBe(true);
			expect(get(user)).toEqual(storedUser);

			const authState = get(auth);
			expect(authState.user).toEqual(storedUser);
			expect(authState.loading).toBe(false);
			expect(authState.error).toBeNull();
		});

		it('should handle corrupted localStorage data gracefully', () => {
			window.localStorage.setItem('qrypt_user', 'invalid-json-data');

			auth.init();

			expect(get(isAuthenticated)).toBe(false);
			expect(get(user)).toBeNull();

			const authState = get(auth);
			expect(authState.user).toBeNull();
			expect(authState.loading).toBe(false);
			expect(authState.error).toBe('Failed to load user data');
		});

		it('should complete logout flow', async () => {
			// Set up authenticated user
			const testUser = {
				id: 'user-123',
				username: 'testuser',
				displayName: 'Test User',
			};

			window.localStorage.setItem('qrypt_user', JSON.stringify(testUser));
			auth.init();

			// Verify user is authenticated
			expect(get(isAuthenticated)).toBe(true);
			expect(get(user)).toEqual(testUser);

			// Mock Supabase signOut
			const { createSupabaseClient } = await import('$lib/supabase.js');
			const mockSupabase = {
				auth: {
					signOut: vi.fn().mockResolvedValue({ error: null }),
				},
			};
			createSupabaseClient.mockReturnValue(mockSupabase);

			// Logout
			await auth.logout();

			// Verify user is logged out
			expect(get(isAuthenticated)).toBe(false);
			expect(get(user)).toBeNull();
			expect(window.localStorage.getItem('qrypt_user')).toBeNull();

			const authState = get(auth);
			expect(authState.user).toBeNull();
			expect(authState.loading).toBe(false);
			expect(authState.error).toBeNull();
		});
	});

	describe('Error Recovery', () => {
		it('should allow retry after SMS sending failure', async () => {
			const phoneNumber = '+1234567890';

			// First attempt fails
			mockApiError('Network error', 500);
			const firstResult = await auth.sendSMS(phoneNumber);
			expect(firstResult.success).toBe(false);

			// Clear error and retry
			auth.clearError();
			expect(get(auth).error).toBeNull();

			// Second attempt succeeds
			mockApiSuccess({
				success: true,
				message: 'Verification code sent successfully',
			});

			const secondResult = await auth.sendSMS(phoneNumber);
			expect(secondResult.success).toBe(true);
		});

		it('should allow retry after verification failure', async () => {
			const phoneNumber = '+1234567890';
			const correctCode = '123456';
			const wrongCode = '654321';

			// Send SMS successfully
			mockApiSuccess({
				success: true,
				message: 'Verification code sent successfully',
			});
			await auth.sendSMS(phoneNumber);

			// First verification attempt with wrong code
			mockApiError('Invalid verification code', 400);
			const firstVerifyResult = await auth.verifySMS(phoneNumber, wrongCode);
			expect(firstVerifyResult.success).toBe(false);

			// Clear error and retry with correct code
			auth.clearError();

			const testUser = {
				id: 'user-123',
				username: 'testuser',
				displayName: 'Test User',
				phoneNumber,
			};

			mockApiSuccess({
				success: true,
				user: testUser,
				isNewUser: false,
			});

			const secondVerifyResult = await auth.verifySMS(phoneNumber, correctCode);
			expect(secondVerifyResult.success).toBe(true);
			expect(get(isAuthenticated)).toBe(true);
		});
	});

	describe('User Profile Management', () => {
		it('should update user profile after authentication', async () => {
			// Authenticate user first
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const initialUser = {
				id: 'user-123',
				username: 'testuser',
				displayName: 'Test User',
				phoneNumber,
				avatarUrl: null,
			};

			mockApiSuccess({ success: true });
			await auth.sendSMS(phoneNumber);

			mockApiSuccess({
				success: true,
				user: initialUser,
				isNewUser: false,
			});
			await auth.verifySMS(phoneNumber, verificationCode);

			expect(get(isAuthenticated)).toBe(true);

			// Update user profile
			const updates = {
				displayName: 'Updated Name',
				avatarUrl: 'https://example.com/new-avatar.jpg',
			};

			auth.updateUser(updates);

			const updatedUser = { ...initialUser, ...updates };
			expect(get(user)).toEqual(updatedUser);

			// Verify localStorage is updated
			const storedUser = JSON.parse(window.localStorage.getItem('qrypt_user'));
			expect(storedUser).toEqual(updatedUser);
		});
	});

	describe('Concurrent Operations', () => {
		it('should handle concurrent SMS requests properly', async () => {
			const phoneNumber = '+1234567890';

			// Mock successful responses for all requests
			global.fetch.mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: async () => ({
						success: true,
						message: 'SMS sent',
					}),
				})
			);

			// Make multiple concurrent requests
			const promises = [
				auth.sendSMS(phoneNumber),
				auth.sendSMS(phoneNumber),
				auth.sendSMS(phoneNumber),
			];

			const results = await Promise.all(promises);

			// All should succeed
			results.forEach(result => {
				expect(result.success).toBe(true);
			});

			// Should not be loading after all complete
			expect(get(auth).loading).toBe(false);
		});

		it('should handle mixed concurrent operations', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';

			// Mock responses
			global.fetch.mockImplementation((url) => {
				if (url.includes('send-sms')) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ success: true }),
					});
				} else if (url.includes('verify-sms')) {
					return Promise.resolve({
						ok: false,
						json: async () => ({ error: 'Invalid code' }),
					});
				}
			});

			// Make concurrent send and verify requests
			const [sendResult, verifyResult] = await Promise.all([
				auth.sendSMS(phoneNumber),
				auth.verifySMS(phoneNumber, verificationCode),
			]);

			expect(sendResult.success).toBe(true);
			expect(verifyResult.success).toBe(false);
			expect(get(isAuthenticated)).toBe(false);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty responses gracefully', async () => {
			const phoneNumber = '+1234567890';

			global.fetch.mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});

			const result = await auth.sendSMS(phoneNumber);

			// Should handle missing success field
			expect(result.success).toBe(false);
		});

		it('should handle malformed JSON responses', async () => {
			const phoneNumber = '+1234567890';

			global.fetch.mockResolvedValue({
				ok: true,
				json: async () => {
					throw new Error('Invalid JSON');
				},
			});

			const result = await auth.sendSMS(phoneNumber);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Failed to send SMS. Please try again.');
		});

		it('should handle network timeouts', async () => {
			const phoneNumber = '+1234567890';

			global.fetch.mockImplementation(() =>
				new Promise((_, reject) => {
					setTimeout(() => reject(new Error('Network timeout')), 100);
				})
			);

			const result = await auth.sendSMS(phoneNumber);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Failed to send SMS. Please try again.');
		});
	});
});