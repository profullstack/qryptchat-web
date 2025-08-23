/**
 * @fileoverview Authentication store for managing user state and auth operations
 * Handles login, logout, and user session management
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { createSupabaseClient } from '$lib/supabase.js';
import { messages } from './messages.js';

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
 */

// Create writable stores
const authState = writable(/** @type {AuthState} */ ({
	user: null,
	loading: true
}));

/**
 * Auth store with methods for authentication operations
 */
function createAuthStore() {
	const { subscribe, set, update } = authState;

	return {
		subscribe,
		
		/**
		 * Initialize auth state from localStorage and restore Supabase session
		 */
		async init() {
			if (!browser) return;
			
			update(state => ({ ...state, loading: true }));
			
			try {
				const storedUser = localStorage.getItem('qrypt_user');
				const storedSession = localStorage.getItem('qrypt_session');
				
				if (storedUser && storedSession) {
					const user = JSON.parse(storedUser);
					const session = JSON.parse(storedSession);
					
					// Check if session is still valid (not expired)
					if (session.access_token && session.expires_at) {
						const expiresAt = new Date(session.expires_at * 1000);
						const now = new Date();
						
						if (expiresAt > now) {
							// Session is still valid, restore user
							update(state => ({ ...state, user, loading: false }));
							return;
						}
					}
					
					// Session is expired or invalid, clear stored data
					localStorage.removeItem('qrypt_user');
					localStorage.removeItem('qrypt_session');
				}
				
				update(state => ({ ...state, loading: false }));
			} catch (error) {
				console.error('Failed to load user from localStorage:', error);
				// Clear potentially corrupted data
				localStorage.removeItem('qrypt_user');
				localStorage.removeItem('qrypt_session');
				update(state => ({ ...state, loading: false }));
			}
		},

		/**
		 * Send SMS verification code using server-side API
		 * @param {string} phoneNumber - Phone number in E.164 format
		 * @returns {Promise<{success: boolean, error?: string}>}
		 */
		async sendSMS(phoneNumber) {
			update(state => ({ ...state, loading: true }));
			messages.clear(); // Clear any existing messages

			try {
				/** @type {Record<string, string>} */
				const headers = {
					'Content-Type': 'application/json'
				};

				// Add Authorization header if we have a session
				const storedSession = browser ? localStorage.getItem('qrypt_session') : null;
				if (storedSession) {
					const session = JSON.parse(storedSession);
					if (session.access_token) {
						headers['Authorization'] = `Bearer ${session.access_token}`;
					}
				}

				const response = await fetch('/api/auth/send-sms', {
					method: 'POST',
					headers,
					body: JSON.stringify({ phoneNumber })
				});

				const data = await response.json();

				if (!response.ok) {
					const errorMessage = data.error || 'Failed to send SMS';
					messages.error(errorMessage);
					update(state => ({ ...state, loading: false }));
					return { success: false, error: errorMessage };
				}

				messages.success('Verification code sent successfully!');
				update(state => ({ ...state, loading: false }));
				return { success: true };

			} catch (error) {
				const errorMessage = 'Failed to send SMS. Please try again.';
				messages.error(errorMessage);
				update(state => ({ ...state, loading: false }));
				return { success: false, error: errorMessage };
			}
		},

		/**
		 * Verify SMS code and login/register user
		 * @param {string} phoneNumber - Phone number in E.164 format
		 * @param {string} verificationCode - 6-digit verification code
		 * @param {string} [username] - Username for new users
		 * @param {string} [displayName] - Display name for new users
		 * @returns {Promise<{success: boolean, error?: string, user?: User, isNewUser?: boolean, requiresUsername?: boolean, session?: any, message?: string}>}
		 */
		async verifySMS(phoneNumber, verificationCode, username, displayName) {
			update(state => ({ ...state, loading: true }));
			messages.clear(); // Clear any existing messages

			try {
				/** @type {Record<string, string>} */
				const headers = {
					'Content-Type': 'application/json'
				};

				// Add Authorization header if we have a session (for profile completion)
				const storedSession = browser ? localStorage.getItem('qrypt_session') : null;
				if (storedSession) {
					const session = JSON.parse(storedSession);
					if (session.access_token) {
						headers['Authorization'] = `Bearer ${session.access_token}`;
					}
				}

				const response = await fetch('/api/auth/verify-sms', {
					method: 'POST',
					headers,
					body: JSON.stringify({
						phoneNumber,
						verificationCode,
						username,
						displayName,
						useSession: !!storedSession // Flag to indicate session-based request
					})
				});

				const data = await response.json();

				// Handle special case where username is required
				if (data.requiresUsername) {
					// Store the session for profile completion
					if (browser && data.session) {
						localStorage.setItem('qrypt_session', JSON.stringify(data.session));
					}
					update(state => ({ ...state, loading: false }));
					return {
						success: false,
						requiresUsername: true,
						session: data.session,
						message: data.message
					};
				}

				if (!response.ok) {
					const errorMessage = data.error || 'Failed to verify code';
					messages.error(errorMessage);
					update(state => ({ ...state, loading: false }));
					return {
						success: false,
						error: errorMessage,
						session: data.session // Keep session for retry if available
					};
				}

				// Store user data and session
				const user = data.user;
				const session = data.session;
				
				if (browser) {
					localStorage.setItem('qrypt_user', JSON.stringify(user));
					// Store the session with proper key
					if (session) {
						localStorage.setItem('qrypt_session', JSON.stringify(session));
					}
				}

				if (data.isNewUser) {
					messages.success('Account created successfully! Welcome to QryptChat!');
				} else {
					messages.success('Welcome back!');
				}

				update(state => ({ ...state, user, loading: false }));
				return { success: true, user, isNewUser: data.isNewUser, session };

			} catch (error) {
				const errorMessage = 'Failed to verify code. Please try again.';
				messages.error(errorMessage);
				update(state => ({ ...state, loading: false }));
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
				localStorage.removeItem('qrypt_session');
			}

			set({ user: null, loading: false });
		},

		/**
		 * Clear messages
		 */
		clearMessages() {
			messages.clear();
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

// Initialize auth on module load
if (browser) {
	auth.init();
}