/**
 * @fileoverview Authentication store for managing user state and auth operations
 * Handles login, logout, and user session management
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { createSupabaseClient } from '$lib/supabase.js';
import { messages } from './messages.js';
import { keyManager } from '$lib/crypto/key-manager.js';

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
						} else if (session.refresh_token) {
							// Token is expired but we have a refresh token, try to refresh
							console.log('Access token expired, attempting to refresh...');
							const refreshResult = await this.refreshSession(session.refresh_token);
							if (refreshResult.success) {
								// Successfully refreshed, restore user with new session
								update(state => ({ ...state, user, loading: false }));
								return;
							}
							// Refresh failed, fall through to clear session
						}
					}
					
					// Session is expired or invalid, clear stored data
					console.log('Session expired and cannot be refreshed, clearing stored data');
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
		 * Refresh the session using refresh token
		 * @param {string} refreshToken
		 * @returns {Promise<{success: boolean, session?: any, error?: string}>}
		 */
		async refreshSession(refreshToken) {
			try {
				const supabase = createSupabaseClient();
				const { data, error } = await supabase.auth.refreshSession({
					refresh_token: refreshToken
				});

				if (error || !data.session) {
					console.error('Failed to refresh session:', error);
					return { success: false, error: error?.message || 'Failed to refresh session' };
				}

				// Store the new session
				if (browser) {
					localStorage.setItem('qrypt_session', JSON.stringify(data.session));
				}

				console.log('Session refreshed successfully');
				return { success: true, session: data.session };
			} catch (error) {
				console.error('Session refresh error:', error);
				return { success: false, error: 'Failed to refresh session' };
			}
		},

		/**
		 * Get current valid session, refreshing if necessary
		 * @returns {Promise<{session?: any, error?: string}>}
		 */
		async getCurrentSession() {
			if (!browser) return { error: 'Not in browser environment' };

			try {
				const storedSession = localStorage.getItem('qrypt_session');
				if (!storedSession) {
					return { error: 'No session found' };
				}

				const session = JSON.parse(storedSession);
				
				// Check if session is still valid
				if (session.access_token && session.expires_at) {
					const expiresAt = new Date(session.expires_at * 1000);
					const now = new Date();
					
					if (expiresAt > now) {
						// Session is still valid
						return { session };
					} else if (session.refresh_token) {
						// Token is expired, try to refresh
						const refreshResult = await this.refreshSession(session.refresh_token);
						if (refreshResult.success) {
							return { session: refreshResult.session };
						}
						return { error: 'Session expired and refresh failed' };
					}
				}
				
				return { error: 'Session expired' };
			} catch (error) {
				console.error('Failed to get current session:', error);
				return { error: 'Failed to get session' };
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
				const sessionResult = await this.getCurrentSession();
				if (sessionResult.session && sessionResult.session.access_token) {
					headers['Authorization'] = `Bearer ${sessionResult.session.access_token}`;
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
				const sessionResult = await this.getCurrentSession();
				if (sessionResult.session && sessionResult.session.access_token) {
					headers['Authorization'] = `Bearer ${sessionResult.session.access_token}`;
				}
				
				// Check if we should use session-based request
				const useSession = !!sessionResult.session;

				const response = await fetch('/api/auth/verify-sms', {
					method: 'POST',
					headers,
					body: JSON.stringify({
						phoneNumber,
						verificationCode,
						username,
						displayName,
						useSession // Flag to indicate session-based request
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