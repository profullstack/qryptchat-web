/**
 * @fileoverview Tests for authentication store
 * Tests the auth store functionality including API calls and state management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { mockApiSuccess, mockApiError, mockNetworkError, suppressConsole, restoreConsole } from '../setup.js';

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

describe('Auth Store', () => {
	let auth, user, isAuthenticated, isLoading, authError;
	let mockSupabase;

	beforeEach(async () => {
		// Clear localStorage
		window.localStorage.clear();
		
		// Reset fetch mock
		global.fetch.mockClear();

		// Setup mock Supabase client
		mockSupabase = {
			auth: {
				signOut: vi.fn(),
			},
		};

		const { createSupabaseClient } = await import('$lib/supabase.js');
		createSupabaseClient.mockReturnValue(mockSupabase);

		// Import auth store after mocks are set up
		const authModule = await import('../../src/lib/stores/auth.js');
		auth = authModule.auth;
		user = authModule.user;
		isAuthenticated = authModule.isAuthenticated;
		isLoading = authModule.isLoading;
		authError = authModule.authError;

		suppressConsole();
	});

	afterEach(() => {
		restoreConsole();
	});

	describe('Initial state', () => {
		it('should have correct initial state', () => {
			const authState = get(auth);
			expect(authState.user).toBeNull();
			expect(authState.loading).toBe(false); // After init
			expect(authState.error).toBeNull();
		});

		it('should have correct derived stores', () => {
			expect(get(user)).toBeNull();
			expect(get(isAuthenticated)).toBe(false);
			expect(get(isLoading)).toBe(false);
			expect(get(authError)).toBeNull();
		});
	});

	describe('Initialization', () => {
		it('should load user from localStorage on init', () => {
			const testUser = {
				id: 'user-123',
				username: 'testuser',
				displayName: 'Test User',
				phoneNumber: '+1234567890',
			};

			window.localStorage.setItem('qrypt_user', JSON.stringify(testUser));
			
			auth.init();

			const authState = get(auth);
			expect(authState.user).toEqual(testUser);
			expect(authState.loading).toBe(false);
		});

		it('should handle invalid JSON in localStorage', () => {
			window.localStorage.setItem('qrypt_user', 'invalid-json');
			
			auth.init();

			const authState = get(auth);
			expect(authState.user).toBeNull();
			expect(authState.loading).toBe(false);
			expect(authState.error).toBe('Failed to load user data');
		});

		it('should handle empty localStorage', () => {
			auth.init();

			const authState = get(auth);
			expect(authState.user).toBeNull();
			expect(authState.loading).toBe(false);
			expect(authState.error).toBeNull();
		});
	});

	describe('sendSMS', () => {
		it('should successfully send SMS', async () => {
			const phoneNumber = '+1234567890';
			mockApiSuccess({ success: true, message: 'SMS sent' });

			const result = await auth.sendSMS(phoneNumber);

			expect(global.fetch).toHaveBeenCalledWith('/api/auth/send-sms', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ phoneNumber }),
			});

			expect(result.success).toBe(true);
			
			const authState = get(auth);
			expect(authState.loading).toBe(false);
			expect(authState.error).toBeNull();
		});

		it('should handle API error response', async () => {
			const phoneNumber = '+1234567890';
			const errorMessage = 'Invalid phone number';
			mockApiError(errorMessage, 400);

			const result = await auth.sendSMS(phoneNumber);

			expect(result.success).toBe(false);
			expect(result.error).toBe(errorMessage);
			
			const authState = get(auth);
			expect(authState.loading).toBe(false);
			expect(authState.error).toBe(errorMessage);
		});

		it('should handle network error', async () => {
			const phoneNumber = '+1234567890';
			mockNetworkError();

			const result = await auth.sendSMS(phoneNumber);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Failed to send SMS. Please try again.');
			
			const authState = get(auth);
			expect(authState.loading).toBe(false);
			expect(authState.error).toBe('Failed to send SMS. Please try again.');
		});

		it('should set loading state during request', async () => {
			const phoneNumber = '+1234567890';
			
			// Mock a delayed response
			global.fetch.mockImplementation(() => 
				new Promise(resolve => {
					setTimeout(() => {
						resolve({
							ok: true,
							json: async () => ({ success: true }),
						});
					}, 100);
				})
			);

			const promise = auth.sendSMS(phoneNumber);
			
			// Check loading state is true during request
			const authStateDuring = get(auth);
			expect(authStateDuring.loading).toBe(true);
			expect(authStateDuring.error).toBeNull();

			await promise;

			// Check loading state is false after request
			const authStateAfter = get(auth);
			expect(authStateAfter.loading).toBe(false);
		});
	});

	describe('verifySMS', () => {
		it('should successfully verify SMS for existing user', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
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

			const result = await auth.verifySMS(phoneNumber, verificationCode);

			expect(global.fetch).toHaveBeenCalledWith('/api/auth/verify-sms', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					phoneNumber,
					verificationCode,
					username: undefined,
					displayName: undefined,
				}),
			});

			expect(result.success).toBe(true);
			expect(result.user).toEqual(testUser);
			expect(result.isNewUser).toBe(false);
			
			// Check user is stored in localStorage
			const storedUser = JSON.parse(window.localStorage.getItem('qrypt_user'));
			expect(storedUser).toEqual(testUser);
			
			// Check store state
			const authState = get(auth);
			expect(authState.user).toEqual(testUser);
			expect(authState.loading).toBe(false);
			expect(authState.error).toBeNull();
			
			// Check derived stores
			expect(get(user)).toEqual(testUser);
			expect(get(isAuthenticated)).toBe(true);
		});

		it('should successfully verify SMS for new user', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'newuser';
			const displayName = 'New User';
			const testUser = {
				id: 'user-456',
				username,
				displayName,
				phoneNumber,
			};

			mockApiSuccess({
				success: true,
				user: testUser,
				isNewUser: true,
			});

			const result = await auth.verifySMS(phoneNumber, verificationCode, username, displayName);

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

			expect(result.success).toBe(true);
			expect(result.user).toEqual(testUser);
			expect(result.isNewUser).toBe(true);
		});

		it('should handle verification error', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const errorMessage = 'Invalid verification code';
			
			mockApiError(errorMessage, 400);

			const result = await auth.verifySMS(phoneNumber, verificationCode);

			expect(result.success).toBe(false);
			expect(result.error).toBe(errorMessage);
			
			const authState = get(auth);
			expect(authState.user).toBeNull();
			expect(authState.loading).toBe(false);
			expect(authState.error).toBe(errorMessage);
		});

		it('should handle network error', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			
			mockNetworkError();

			const result = await auth.verifySMS(phoneNumber, verificationCode);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Failed to verify code. Please try again.');
			
			const authState = get(auth);
			expect(authState.loading).toBe(false);
			expect(authState.error).toBe('Failed to verify code. Please try again.');
		});
	});

	describe('logout', () => {
		it('should successfully logout user', async () => {
			// Set up initial user state
			const testUser = {
				id: 'user-123',
				username: 'testuser',
			};
			
			window.localStorage.setItem('qrypt_user', JSON.stringify(testUser));
			auth.init();
			
			// Verify user is logged in
			expect(get(auth).user).toEqual(testUser);
			expect(get(isAuthenticated)).toBe(true);

			// Mock successful Supabase signOut
			mockSupabase.auth.signOut.mockResolvedValue({ error: null });

			await auth.logout();

			// Verify user is logged out
			const authState = get(auth);
			expect(authState.user).toBeNull();
			expect(authState.loading).toBe(false);
			expect(authState.error).toBeNull();
			
			// Verify localStorage is cleared
			expect(window.localStorage.getItem('qrypt_user')).toBeNull();
			
			// Verify Supabase signOut was called
			expect(mockSupabase.auth.signOut).toHaveBeenCalled();
			
			// Check derived stores
			expect(get(user)).toBeNull();
			expect(get(isAuthenticated)).toBe(false);
		});

		it('should handle Supabase logout error gracefully', async () => {
			const testUser = { id: 'user-123', username: 'testuser' };
			window.localStorage.setItem('qrypt_user', JSON.stringify(testUser));
			auth.init();

			// Mock Supabase signOut error
			mockSupabase.auth.signOut.mockRejectedValue(new Error('Supabase error'));

			await auth.logout();

			// Should still clear local state even if Supabase fails
			const authState = get(auth);
			expect(authState.user).toBeNull();
			expect(window.localStorage.getItem('qrypt_user')).toBeNull();
		});
	});

	describe('clearError', () => {
		it('should clear error state', () => {
			// Set error state
			auth.sendSMS('+invalid').then(() => {});
			mockApiError('Test error', 400);
			
			// Wait for error to be set
			setTimeout(() => {
				expect(get(auth).error).toBe('Test error');
				
				auth.clearError();
				
				expect(get(auth).error).toBeNull();
				expect(get(authError)).toBeNull();
			}, 0);
		});
	});

	describe('updateUser', () => {
		it('should update user profile', () => {
			const initialUser = {
				id: 'user-123',
				username: 'testuser',
				displayName: 'Test User',
			};
			
			// Set initial user
			window.localStorage.setItem('qrypt_user', JSON.stringify(initialUser));
			auth.init();

			const updates = {
				displayName: 'Updated Name',
				avatarUrl: 'https://example.com/avatar.jpg',
			};

			auth.updateUser(updates);

			const expectedUser = { ...initialUser, ...updates };
			
			// Check store state
			const authState = get(auth);
			expect(authState.user).toEqual(expectedUser);
			
			// Check localStorage
			const storedUser = JSON.parse(window.localStorage.getItem('qrypt_user'));
			expect(storedUser).toEqual(expectedUser);
			
			// Check derived store
			expect(get(user)).toEqual(expectedUser);
		});

		it('should not update if no user is logged in', () => {
			const updates = { displayName: 'Updated Name' };
			
			auth.updateUser(updates);
			
			const authState = get(auth);
			expect(authState.user).toBeNull();
		});
	});

	describe('State management', () => {
		it('should properly manage loading states', async () => {
			const phoneNumber = '+1234567890';
			
			// Initial state
			expect(get(isLoading)).toBe(false);
			
			// Mock delayed response
			global.fetch.mockImplementation(() => 
				new Promise(resolve => {
					setTimeout(() => {
						resolve({
							ok: true,
							json: async () => ({ success: true }),
						});
					}, 50);
				})
			);

			const promise = auth.sendSMS(phoneNumber);
			
			// Should be loading during request
			expect(get(isLoading)).toBe(true);
			
			await promise;
			
			// Should not be loading after request
			expect(get(isLoading)).toBe(false);
		});

		it('should properly manage error states', async () => {
			const phoneNumber = '+1234567890';
			const errorMessage = 'Test error';
			
			// Initial state
			expect(get(authError)).toBeNull();
			
			mockApiError(errorMessage, 400);
			
			await auth.sendSMS(phoneNumber);
			
			// Should have error after failed request
			expect(get(authError)).toBe(errorMessage);
			
			// Clear error
			auth.clearError();
			
			// Should not have error after clearing
			expect(get(authError)).toBeNull();
		});

		it('should properly manage authentication state', async () => {
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const testUser = {
				id: 'user-123',
				username: 'testuser',
			};

			// Initial state - not authenticated
			expect(get(isAuthenticated)).toBe(false);
			expect(get(user)).toBeNull();

			mockApiSuccess({
				success: true,
				user: testUser,
				isNewUser: false,
			});

			await auth.verifySMS(phoneNumber, verificationCode);

			// Should be authenticated after successful verification
			expect(get(isAuthenticated)).toBe(true);
			expect(get(user)).toEqual(testUser);

			await auth.logout();

			// Should not be authenticated after logout
			expect(get(isAuthenticated)).toBe(false);
			expect(get(user)).toBeNull();
		});
	});

	describe('Edge cases', () => {
		it('should handle undefined parameters gracefully', async () => {
			const result1 = await auth.sendSMS(undefined);
			expect(result1.success).toBe(false);

			const result2 = await auth.verifySMS(undefined, undefined);
			expect(result2.success).toBe(false);
		});

		it('should handle empty string parameters', async () => {
			mockApiError('Phone number is required', 400);
			
			const result = await auth.sendSMS('');
			expect(result.success).toBe(false);
		});

		it('should handle concurrent requests properly', async () => {
			const phoneNumber = '+1234567890';
			
			mockApiSuccess({ success: true });
			
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
			expect(get(isLoading)).toBe(false);
		});
	});
});