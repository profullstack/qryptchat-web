/**
 * @fileoverview Authentication store for managing user state and auth operations
 * Handles login, logout, and user session management
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { createSupabaseClient } from '$lib/supabase.js';

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} username
 * @property {string} displayName
 * @property {string} phoneNumber
 * @property {string|null} avatarUrl
 * @property {string} createdAt
 */

/**
 * @typedef {Object} AuthState
 * @property {User|null} user
 * @property {boolean} loading
 * @property {string|null} error
 */

// Create writable stores
const authState = writable(/** @type {AuthState} */ ({
	user: null,
	loading: true,
	error: null
}));

/**
 * Auth store with methods for authentication operations
 */
function createAuthStore() {
	const { subscribe, set, update } = authState;

	return {
		subscribe,
		
		/**
		 * Initialize auth state from localStorage
		 */
		init() {
			if (!browser) return;
			
			update(state => ({ ...state, loading: true }));
			
			try {
				const storedUser = localStorage.getItem('qrypt_user');
				if (storedUser) {
					const user = JSON.parse(storedUser);
					update(state => ({ ...state, user, loading: false }));
				} else {
					update(state => ({ ...state, loading: false }));
				}
			} catch (error) {
				console.error('Failed to load user from localStorage:', error);
				update(state => ({ ...state, loading: false, error: 'Failed to load user data' }));
			}
		},

		/**
		 * Send SMS verification code using Supabase Auth
		 * @param {string} phoneNumber - Phone number in E.164 format
		 * @returns {Promise<{success: boolean, error?: string}>}
		 */
		async sendSMS(phoneNumber) {
			update(state => ({ ...state, loading: true, error: null }));

			try {
				const supabase = createSupabaseClient();
				const { error } = await supabase.auth.signInWithOtp({
					phone: phoneNumber,
					options: {
						channel: 'sms'
					}
				});

				if (error) {
					update(state => ({ ...state, loading: false, error: error.message }));
					return { success: false, error: error.message };
				}

				update(state => ({ ...state, loading: false }));
				return { success: true };

			} catch (error) {
				const errorMessage = 'Failed to send SMS. Please try again.';
				update(state => ({ ...state, loading: false, error: errorMessage }));
				return { success: false, error: errorMessage };
			}
		},

		/**
		 * Verify SMS code and login/register user
		 * @param {string} phoneNumber - Phone number in E.164 format
		 * @param {string} verificationCode - 6-digit verification code
		 * @param {string} [username] - Username for new users
		 * @param {string} [displayName] - Display name for new users
		 * @returns {Promise<{success: boolean, error?: string, user?: User, isNewUser?: boolean}>}
		 */
		async verifySMS(phoneNumber, verificationCode, username, displayName) {
			update(state => ({ ...state, loading: true, error: null }));

			try {
				const response = await fetch('/api/auth/verify-sms', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ 
						phoneNumber, 
						verificationCode, 
						username, 
						displayName 
					})
				});

				const data = await response.json();

				if (!response.ok) {
					update(state => ({ ...state, loading: false, error: data.error }));
					return { success: false, error: data.error };
				}

				// Store user data
				const user = data.user;
				if (browser) {
					localStorage.setItem('qrypt_user', JSON.stringify(user));
				}

				update(state => ({ ...state, user, loading: false }));
				return { success: true, user, isNewUser: data.isNewUser };

			} catch (error) {
				const errorMessage = 'Failed to verify code. Please try again.';
				update(state => ({ ...state, loading: false, error: errorMessage }));
				return { success: false, error: errorMessage };
			}
		},

		/**
		 * Logout user
		 */
		async logout() {
			update(state => ({ ...state, loading: true }));

			try {
				// Clear Supabase session if exists
				if (browser) {
					const supabase = createSupabaseClient();
					await supabase.auth.signOut();
				}
			} catch (error) {
				console.error('Supabase logout error:', error);
			}

			// Clear local storage and state
			if (browser) {
				localStorage.removeItem('qrypt_user');
			}

			set({ user: null, loading: false, error: null });
		},

		/**
		 * Clear error state
		 */
		clearError() {
			update(state => ({ ...state, error: null }));
		},

		/**
		 * Update user profile
		 * @param {Partial<User>} updates
		 */
		updateUser(updates) {
			update(state => {
				if (!state.user) return state;
				
				const updatedUser = { ...state.user, ...updates };
				
				if (browser) {
					localStorage.setItem('qrypt_user', JSON.stringify(updatedUser));
				}
				
				return { ...state, user: updatedUser };
			});
		}
	};
}

// Export the auth store
export const auth = createAuthStore();

// Derived stores for convenience
export const user = derived(auth, $auth => $auth.user);
export const isAuthenticated = derived(auth, $auth => !!$auth.user);
export const isLoading = derived(auth, $auth => $auth.loading);
export const authError = derived(auth, $auth => $auth.error);

// Initialize auth on module load
if (browser) {
	auth.init();
}