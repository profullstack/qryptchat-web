/**
 * @fileoverview Tests for automatic key generation during user signup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { mockApiSuccess, mockApiError, suppressConsole, restoreConsole } from './setup.js';

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true,
}));

// Mock crypto modules
const mockKeyManager = {
	hasUserKeys: vi.fn(),
	generateUserKeys: vi.fn()
};

const mockClientEncryption = {
	initialize: vi.fn()
};

const mockMessages = {
	success: vi.fn(),
	warning: vi.fn(),
	error: vi.fn(),
	clear: vi.fn()
};

// Mock Supabase client
vi.mock('$lib/supabase.js', () => ({
	createSupabaseClient: vi.fn(() => ({
		auth: {
			refreshSession: vi.fn(),
			signOut: vi.fn()
		}
	}))
}));

// Mock crypto modules
vi.mock('$lib/crypto/key-manager.js', () => ({
	keyManager: mockKeyManager
}));

vi.mock('$lib/crypto/client-encryption.js', () => ({
	clientEncryption: mockClientEncryption
}));

vi.mock('$lib/stores/messages.js', () => ({
	messages: mockMessages
}));

describe('Auth Store - Automatic Key Generation', () => {
	let auth, user, isAuthenticated, isLoading;
	
	beforeEach(async () => {
		// Clear localStorage
		window.localStorage.clear();
		
		// Reset fetch mock
		global.fetch.mockClear();
		
		// Clear all crypto module mocks
		Object.values(mockKeyManager).forEach(mock => mock.mockClear());
		Object.values(mockClientEncryption).forEach(mock => mock.mockClear());
		Object.values(mockMessages).forEach(mock => mock.mockClear());
		
		// Setup default mock behaviors
		mockClientEncryption.initialize.mockResolvedValue();
		mockKeyManager.hasUserKeys.mockResolvedValue(false);
		mockKeyManager.generateUserKeys.mockResolvedValue();
		
		// Import auth store after mocks are set up
		const authModule = await import('../src/lib/stores/auth.js');
		auth = authModule.auth;
		user = authModule.user;
		isAuthenticated = authModule.isAuthenticated;
		isLoading = authModule.isLoading;
		
		suppressConsole();
	});
	
	afterEach(() => {
		restoreConsole();
	});

	describe('verifySMS - New User Key Generation', () => {
		it('should automatically generate encryption keys for new users', async () => {
			// Arrange
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'testuser';
			const displayName = 'Test User';
			
			const testUser = {
				id: 'test-user-id',
				username,
				displayName,
				phoneNumber,
				avatarUrl: null,
				createdAt: new Date().toISOString()
			};
			
			mockApiSuccess({
				success: true,
				user: testUser,
				session: {
					access_token: 'test-token',
					refresh_token: 'test-refresh',
					expires_at: Math.floor(Date.now() / 1000) + 3600
				},
				isNewUser: true
			});
			
			// Act
			const result = await auth.verifySMS(phoneNumber, verificationCode, username, displayName);
			
			// Assert
			expect(result.success).toBe(true);
			expect(result.isNewUser).toBe(true);
			expect(result.user).toEqual(testUser);
			
			// Verify encryption initialization was called
			expect(mockClientEncryption.initialize).toHaveBeenCalledOnce();
			
			// Verify key generation flow
			expect(mockKeyManager.hasUserKeys).toHaveBeenCalledOnce();
			expect(mockKeyManager.generateUserKeys).toHaveBeenCalledOnce();
			
			// Verify success message includes key generation info
			expect(mockMessages.success).toHaveBeenCalledWith(
				'Account created successfully! Your encryption keys have been generated. Welcome to QryptChat!'
			);
		});

		it('should skip key generation if new user already has keys', async () => {
			// Arrange
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'testuser';
			const displayName = 'Test User';
			
			const testUser = {
				id: 'test-user-id',
				username,
				displayName,
				phoneNumber,
				avatarUrl: null,
				createdAt: new Date().toISOString()
			};
			
			mockApiSuccess({
				success: true,
				user: testUser,
				session: {
					access_token: 'test-token',
					refresh_token: 'test-refresh',
					expires_at: Math.floor(Date.now() / 1000) + 3600
				},
				isNewUser: true
			});
			
			// User already has keys
			mockKeyManager.hasUserKeys.mockResolvedValue(true);
			
			// Act
			const result = await auth.verifySMS(phoneNumber, verificationCode, username, displayName);
			
			// Assert
			expect(result.success).toBe(true);
			expect(result.isNewUser).toBe(true);
			
			// Verify encryption initialization was called
			expect(mockClientEncryption.initialize).toHaveBeenCalledOnce();
			
			// Verify key check was done but generation was skipped
			expect(mockKeyManager.hasUserKeys).toHaveBeenCalledOnce();
			expect(mockKeyManager.generateUserKeys).not.toHaveBeenCalled();
			
			// Should still show success message
			expect(mockMessages.success).toHaveBeenCalledWith(
				'Account created successfully! Your encryption keys have been generated. Welcome to QryptChat!'
			);
		});

		it('should handle key generation errors gracefully', async () => {
			// Arrange
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'testuser';
			const displayName = 'Test User';
			
			const testUser = {
				id: 'test-user-id',
				username,
				displayName,
				phoneNumber,
				avatarUrl: null,
				createdAt: new Date().toISOString()
			};
			
			mockApiSuccess({
				success: true,
				user: testUser,
				session: {
					access_token: 'test-token',
					refresh_token: 'test-refresh',
					expires_at: Math.floor(Date.now() / 1000) + 3600
				},
				isNewUser: true
			});
			
			// Key generation fails
			mockKeyManager.generateUserKeys.mockRejectedValue(new Error('Key generation failed'));
			
			// Act
			const result = await auth.verifySMS(phoneNumber, verificationCode, username, displayName);
			
			// Assert
			expect(result.success).toBe(true); // Signup should still succeed
			expect(result.isNewUser).toBe(true);
			
			// Verify warning message was shown
			expect(mockMessages.warning).toHaveBeenCalledWith(
				'Account created successfully, but there was an issue setting up encryption. Please visit Settings to initialize your encryption keys.'
			);
		});

		it('should handle encryption initialization errors gracefully', async () => {
			// Arrange
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			const username = 'testuser';
			const displayName = 'Test User';
			
			const testUser = {
				id: 'test-user-id',
				username,
				displayName,
				phoneNumber,
				avatarUrl: null,
				createdAt: new Date().toISOString()
			};
			
			mockApiSuccess({
				success: true,
				user: testUser,
				session: {
					access_token: 'test-token',
					refresh_token: 'test-refresh',
					expires_at: Math.floor(Date.now() / 1000) + 3600
				},
				isNewUser: true
			});
			
			// Encryption initialization fails
			mockClientEncryption.initialize.mockRejectedValue(new Error('Encryption init failed'));
			
			// Act
			const result = await auth.verifySMS(phoneNumber, verificationCode, username, displayName);
			
			// Assert
			expect(result.success).toBe(true); // Signup should still succeed
			expect(result.isNewUser).toBe(true);
			
			// Verify warning message was shown
			expect(mockMessages.warning).toHaveBeenCalledWith(
				'Account created successfully, but there was an issue setting up encryption. Please visit Settings to initialize your encryption keys.'
			);
		});
	});

	describe('verifySMS - Existing User Key Verification', () => {
		it('should verify encryption keys for existing users', async () => {
			// Arrange
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			
			const testUser = {
				id: 'existing-user-id',
				username: 'existinguser',
				displayName: 'Existing User',
				phoneNumber,
				avatarUrl: null,
				createdAt: new Date().toISOString()
			};
			
			mockApiSuccess({
				success: true,
				user: testUser,
				session: {
					access_token: 'test-token',
					refresh_token: 'test-refresh',
					expires_at: Math.floor(Date.now() / 1000) + 3600
				},
				isNewUser: false
			});
			
			// Existing user has keys
			mockKeyManager.hasUserKeys.mockResolvedValue(true);
			
			// Act
			const result = await auth.verifySMS(phoneNumber, verificationCode);
			
			// Assert
			expect(result.success).toBe(true);
			expect(result.isNewUser).toBe(false);
			expect(result.user).toEqual(testUser);
			
			// Verify encryption initialization was called
			expect(mockClientEncryption.initialize).toHaveBeenCalledOnce();
			
			// Verify key check was done but no generation
			expect(mockKeyManager.hasUserKeys).toHaveBeenCalledOnce();
			expect(mockKeyManager.generateUserKeys).not.toHaveBeenCalled();
			
			// Verify normal welcome message
			expect(mockMessages.success).toHaveBeenCalledWith('Welcome back!');
		});

		it('should warn existing users missing encryption keys', async () => {
			// Arrange
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			
			const testUser = {
				id: 'existing-user-id',
				username: 'existinguser',
				displayName: 'Existing User',
				phoneNumber,
				avatarUrl: null,
				createdAt: new Date().toISOString()
			};
			
			mockApiSuccess({
				success: true,
				user: testUser,
				session: {
					access_token: 'test-token',
					refresh_token: 'test-refresh',
					expires_at: Math.floor(Date.now() / 1000) + 3600
				},
				isNewUser: false
			});
			
			// Existing user missing keys
			mockKeyManager.hasUserKeys.mockResolvedValue(false);
			
			// Act
			const result = await auth.verifySMS(phoneNumber, verificationCode);
			
			// Assert
			expect(result.success).toBe(true);
			expect(result.isNewUser).toBe(false);
			
			// Verify warning message for missing keys
			expect(mockMessages.warning).toHaveBeenCalledWith(
				'Welcome back! Please visit Settings to set up your encryption keys.'
			);
		});

		it('should handle encryption errors for existing users gracefully', async () => {
			// Arrange
			const phoneNumber = '+1234567890';
			const verificationCode = '123456';
			
			const testUser = {
				id: 'existing-user-id',
				username: 'existinguser',
				displayName: 'Existing User',
				phoneNumber,
				avatarUrl: null,
				createdAt: new Date().toISOString()
			};
			
			mockApiSuccess({
				success: true,
				user: testUser,
				session: {
					access_token: 'test-token',
					refresh_token: 'test-refresh',
					expires_at: Math.floor(Date.now() / 1000) + 3600
				},
				isNewUser: false
			});
			
			// Encryption initialization fails
			mockClientEncryption.initialize.mockRejectedValue(new Error('Encryption init failed'));
			
			// Act
			const result = await auth.verifySMS(phoneNumber, verificationCode);
			
			// Assert
			expect(result.success).toBe(true); // Login should still succeed
			expect(result.isNewUser).toBe(false);
			
			// Verify warning message was shown
			expect(mockMessages.warning).toHaveBeenCalledWith(
				'Welcome back! There was an issue with encryption initialization. Please visit Settings if you experience issues.'
			);
		});
	});
});