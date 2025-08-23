// Test authentication store for development/testing purposes
import { writable } from 'svelte/store';

// Mock user data for testing
const mockUser = {
	id: 'test-user-123',
	username: 'testuser',
	displayName: 'Test User',
	phone: '+15551234567',
	avatarUrl: null,
	createdAt: new Date().toISOString()
};

// Create test authentication stores with proper typing
export const testUser = writable(/** @type {typeof mockUser | null} */ (null));
export const testIsAuthenticated = writable(false);

// Test authentication functions
export const testAuth = {
	async login() {
		testUser.set(mockUser);
		testIsAuthenticated.set(true);
		return { success: true };
	},

	async logout() {
		testUser.set(null);
		testIsAuthenticated.set(false);
		return { success: true };
	},

	async initialize() {
		// Simulate being logged in for testing
		testUser.set(mockUser);
		testIsAuthenticated.set(true);
	}
};