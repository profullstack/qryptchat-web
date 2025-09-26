/**
 * Test for phone number authentication fix
 * Ensures existing users can login with just phone number without username requirement
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import fetch from 'node-fetch';

// Mock global fetch for testing
global.fetch = fetch;

describe('Phone Authentication Fix', () => {
	let mockRequestBody;
	let mockResponse;
	let mockFetch;

	beforeEach(() => {
		// Mock fetch to capture request body
		mockFetch = global.fetch;
		global.fetch = async (url, options) => {
			mockRequestBody = JSON.parse(options.body);
			return {
				ok: true,
				json: async () => mockResponse
			};
		};
	});

	afterEach(() => {
		global.fetch = mockFetch;
	});

	it('should not send username/displayName for initial SMS verification', async () => {
		// Import auth store dynamically to use mocked fetch
		const { auth } = await import('../src/lib/stores/auth.js');
		
		// Mock successful response for existing user
		mockResponse = {
			success: true,
			user: {
				id: 'test-user-id',
				username: 'testuser',
				displayName: 'Test User',
				phoneNumber: '+1234567890',
				avatarUrl: null,
				createdAt: new Date().toISOString()
			},
			session: {
				access_token: 'mock-token',
				expires_at: Math.floor(Date.now() / 1000) + 3600
			},
			isNewUser: false
		};

		// Call verifySMS without username/displayName (existing user flow)
		await auth.verifySMS('+1234567890', '123456');

		// Verify that request body only contains phone and code
		expect(mockRequestBody).to.have.property('phoneNumber', '+1234567890');
		expect(mockRequestBody).to.have.property('verificationCode', '123456');
		expect(mockRequestBody).to.not.have.property('username');
		expect(mockRequestBody).to.not.have.property('displayName');
		expect(mockRequestBody).to.not.have.property('useSession');
	});

	it('should send username/displayName only for profile completion with session', async () => {
		// Import auth store dynamically to use mocked fetch
		const { auth } = await import('../src/lib/stores/auth.js');
		
		// Mock localStorage to simulate existing session
		const mockLocalStorage = {
			getItem: (key) => {
				if (key === 'qrypt_session') {
					return JSON.stringify({
						access_token: 'mock-session-token',
						expires_at: Math.floor(Date.now() / 1000) + 3600
					});
				}
				return null;
			}
		};
		
		// Temporarily replace localStorage
		const originalLocalStorage = global.localStorage;
		global.localStorage = mockLocalStorage;

		// Mock successful response for new user creation
		mockResponse = {
			success: true,
			user: {
				id: 'new-user-id',
				username: 'newuser',
				displayName: 'New User',
				phoneNumber: '+1234567890',
				avatarUrl: null,
				createdAt: new Date().toISOString()
			},
			session: {
				access_token: 'mock-token',
				expires_at: Math.floor(Date.now() / 1000) + 3600
			},
			isNewUser: true
		};

		// Call verifySMS with username/displayName (profile completion flow)
		await auth.verifySMS('+1234567890', '123456', 'newuser', 'New User');

		// Verify that request body contains all required fields for profile completion
		expect(mockRequestBody).to.have.property('phoneNumber', '+1234567890');
		expect(mockRequestBody).to.have.property('verificationCode', '123456');
		expect(mockRequestBody).to.have.property('username', 'newuser');
		expect(mockRequestBody).to.have.property('displayName', 'New User');
		expect(mockRequestBody).to.have.property('useSession', true);

		// Restore localStorage
		global.localStorage = originalLocalStorage;
	});

	it('should handle requiresUsername response correctly', async () => {
		// Import auth store dynamically to use mocked fetch
		const { auth } = await import('../src/lib/stores/auth.js');
		
		// Mock response indicating username is required
		mockResponse = {
			success: false,
			requiresUsername: true,
			message: 'Username is required for new users',
			session: {
				access_token: 'mock-session-token',
				expires_at: Math.floor(Date.now() / 1000) + 3600
			}
		};

		// Call verifySMS for new user (no username provided)
		const result = await auth.verifySMS('+1234567890', '123456');

		// Verify the response indicates username is required
		expect(result).to.have.property('success', false);
		expect(result).to.have.property('requiresUsername', true);
		expect(result).to.have.property('session');
		expect(result.session).to.have.property('access_token', 'mock-session-token');
	});
});