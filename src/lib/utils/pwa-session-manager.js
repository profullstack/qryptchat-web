/**
 * @fileoverview PWA Session Manager for handling session restoration
 * Specifically addresses session loss issues on Linux/KDE/Wayland when PWA is minimized
 */

import { browser } from '$app/environment';
import { auth } from '$lib/stores/auth.js';
import { chat, wsChat } from '$lib/stores/chat.js';

/**
 * PWA Session Manager class
 */
export class PWASessionManager {
	constructor() {
		this.isInitialized = false;
		this.visibilityChangeHandler = null;
		this.beforeUnloadHandler = null;
		this.sessionCheckInterval = null;
		this.reconnectAttempts = 0;
		this.maxReconnectAttempts = 5;
		this.baseReconnectDelay = 1000;
		this.maxReconnectDelay = 30000;
		this.sessionValidationTimeout = null;
		
		// Track app state
		this.appState = {
			isVisible: true,
			wasMinimized: false,
			lastActiveTime: Date.now(),
			connectionLost: false
		};

		// Bind methods to preserve context
		this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
		this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
		this.validateAndRestoreSession = this.validateAndRestoreSession.bind(this);
	}

	/**
	 * Initialize the PWA session manager
	 */
	init() {
		if (!browser || this.isInitialized) return;

		console.log('🔄 Initializing PWA Session Manager...');

		// Set up visibility change listener
		this.setupVisibilityListener();

		// Set up beforeunload listener
		this.setupBeforeUnloadListener();

		// Set up periodic session validation
		this.setupSessionValidation();

		// Initial session check
		this.validateAndRestoreSession();

		this.isInitialized = true;
		console.log('✅ PWA Session Manager initialized');
	}

	/**
	 * Clean up event listeners and intervals
	 */
	destroy() {
		if (!browser || !this.isInitialized) return;

		console.log('🧹 Cleaning up PWA Session Manager...');

		if (this.visibilityChangeHandler) {
			document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
		}

		if (this.beforeUnloadHandler) {
			window.removeEventListener('beforeunload', this.beforeUnloadHandler);
		}

		if (this.sessionCheckInterval) {
			clearInterval(this.sessionCheckInterval);
		}

		if (this.sessionValidationTimeout) {
			clearTimeout(this.sessionValidationTimeout);
		}

		this.isInitialized = false;
		console.log('✅ PWA Session Manager cleaned up');
	}

	/**
	 * Set up visibility change listener for PWA state changes
	 */
	setupVisibilityListener() {
		this.visibilityChangeHandler = this.handleVisibilityChange;
		document.addEventListener('visibilitychange', this.visibilityChangeHandler);
	}

	/**
	 * Set up beforeunload listener to save state
	 */
	setupBeforeUnloadListener() {
		this.beforeUnloadHandler = this.handleBeforeUnload;
		window.addEventListener('beforeunload', this.beforeUnloadHandler);
	}

	/**
	 * Set up periodic session validation
	 */
	setupSessionValidation() {
		// Check session every 5 minutes
		this.sessionCheckInterval = setInterval(() => {
			this.validateSession();
		}, 5 * 60 * 1000);
	}

	/**
	 * Handle visibility change events
	 */
	async handleVisibilityChange() {
		const isHidden = document.hidden;
		const visibilityState = document.visibilityState;

		console.log(`🔄 Visibility changed: ${visibilityState} (hidden: ${isHidden})`);

		if (isHidden) {
			// App is being minimized or hidden
			this.appState.isVisible = false;
			this.appState.wasMinimized = true;
			this.appState.lastActiveTime = Date.now();
			
			console.log('📱 PWA minimized - saving state...');
			this.saveAppState();
		} else {
			// App is being restored or made visible
			this.appState.isVisible = true;
			const timeSinceMinimized = Date.now() - this.appState.lastActiveTime;
			
			console.log(`📱 PWA restored after ${Math.round(timeSinceMinimized / 1000)}s`);
			
			// If app was minimized for more than 30 seconds, validate session
			if (this.appState.wasMinimized && timeSinceMinimized > 30000) {
				console.log('🔄 Long minimization detected - validating session...');
				await this.validateAndRestoreSession();
			}
			
			this.appState.wasMinimized = false;
		}
	}

	/**
	 * Handle beforeunload event
	 */
	handleBeforeUnload() {
		console.log('🔄 App unloading - saving state...');
		this.saveAppState();
	}

	/**
	 * Save current app state to localStorage
	 */
	saveAppState() {
		try {
			const stateToSave = {
				...this.appState,
				timestamp: Date.now()
			};
			
			localStorage.setItem('qrypt_app_state', JSON.stringify(stateToSave));
			console.log('💾 App state saved');
		} catch (error) {
			console.error('❌ Failed to save app state:', error);
		}
	}

	/**
	 * Load app state from localStorage
	 */
	loadAppState() {
		try {
			const savedState = localStorage.getItem('qrypt_app_state');
			if (savedState) {
				const parsed = JSON.parse(savedState);
				
				// Only restore if state is less than 1 hour old
				const stateAge = Date.now() - parsed.timestamp;
				if (stateAge < 60 * 60 * 1000) {
					this.appState = { ...this.appState, ...parsed };
					console.log('📂 App state loaded');
					return true;
				} else {
					console.log('⏰ App state too old, ignoring');
					localStorage.removeItem('qrypt_app_state');
				}
			}
		} catch (error) {
			console.error('❌ Failed to load app state:', error);
			localStorage.removeItem('qrypt_app_state');
		}
		return false;
	}

	/**
	 * Validate current session
	 */
	async validateSession() {
		try {
			const sessionResult = await auth.getCurrentSession();
			
			if (sessionResult.error) {
				console.log('⚠️ Session validation failed:', sessionResult.error);
				return false;
			}
			
			console.log('✅ Session is valid');
			return true;
		} catch (error) {
			console.error('❌ Session validation error:', error);
			return false;
		}
	}

	/**
	 * Validate and restore session after app resume
	 */
	async validateAndRestoreSession() {
		console.log('🔄 Validating and restoring session...');

		try {
			// Load previous app state
			this.loadAppState();

			// Validate current session
			const isSessionValid = await this.validateSession();
			
			if (!isSessionValid) {
				console.log('❌ Session invalid - user needs to re-authenticate');
				this.handleSessionExpired();
				return false;
			}

			// Check WebSocket connection
			await this.ensureWebSocketConnection();

			console.log('✅ Session restored successfully');
			this.reconnectAttempts = 0; // Reset reconnect attempts on success
			return true;

		} catch (error) {
			console.error('❌ Session restoration failed:', error);
			return false;
		}
	}

	/**
	 * Ensure WebSocket connection is active
	 */
	async ensureWebSocketConnection() {
		return new Promise((resolve, reject) => {
			// Clear any existing timeout
			if (this.sessionValidationTimeout) {
				clearTimeout(this.sessionValidationTimeout);
			}

			// Check if WebSocket is already connected
			const currentState = wsChat.getState();
			if (currentState.connected && currentState.authenticated) {
				console.log('✅ WebSocket already connected and authenticated');
				resolve(true);
				return;
			}

			console.log('🔄 WebSocket not connected - attempting reconnection...');

			// Get current session for reconnection
			auth.getCurrentSession().then(sessionResult => {
				if (sessionResult.error || !sessionResult.session) {
					reject(new Error('No valid session for WebSocket reconnection'));
					return;
				}

				// Attempt to reconnect WebSocket
				wsChat.connect(sessionResult.session.access_token);

				// Set up timeout for connection attempt
				this.sessionValidationTimeout = setTimeout(() => {
					const state = wsChat.getState();
					if (state.connected && state.authenticated) {
						console.log('✅ WebSocket reconnected successfully');
						resolve(true);
					} else {
						console.log('⚠️ WebSocket reconnection timeout');
						this.handleReconnectionFailure();
						reject(new Error('WebSocket reconnection timeout'));
					}
				}, 10000); // 10 second timeout

			}).catch(error => {
				reject(error);
			});
		});
	}

	/**
	 * Handle session expiration
	 */
	handleSessionExpired() {
		console.log('🔄 Handling expired session...');
		
		// Clear stored session data
		localStorage.removeItem('qrypt_session');
		localStorage.removeItem('qrypt_user');
		localStorage.removeItem('qrypt_app_state');
		
		// Disconnect WebSocket
		wsChat.disconnect();
		
		// Reset auth state
		auth.logout();
		
		console.log('🔄 Session cleared - user needs to re-authenticate');
	}

	/**
	 * Handle WebSocket reconnection failure
	 */
	async handleReconnectionFailure() {
		this.reconnectAttempts++;
		
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.log('❌ Max reconnection attempts reached');
			this.appState.connectionLost = true;
			return;
		}

		const delay = this.calculateBackoffDelay(this.reconnectAttempts);
		console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

		setTimeout(async () => {
			try {
				await this.ensureWebSocketConnection();
			} catch (error) {
				console.error('❌ Reconnection attempt failed:', error);
				await this.handleReconnectionFailure();
			}
		}, delay);
	}

	/**
	 * Calculate exponential backoff delay
	 */
	calculateBackoffDelay(attempt) {
		const delay = Math.min(
			this.baseReconnectDelay * Math.pow(2, attempt - 1),
			this.maxReconnectDelay
		);
		
		// Add some jitter to prevent thundering herd
		const jitter = Math.random() * 0.1 * delay;
		return Math.floor(delay + jitter);
	}

	/**
	 * Get current app state
	 */
	getAppState() {
		return { ...this.appState };
	}

	/**
	 * Check if app is in a problematic state
	 */
	isInProblematicState() {
		return this.appState.connectionLost || this.reconnectAttempts >= this.maxReconnectAttempts;
	}

	/**
	 * Reset connection state (useful for manual retry)
	 */
	resetConnectionState() {
		this.reconnectAttempts = 0;
		this.appState.connectionLost = false;
		console.log('🔄 Connection state reset');
	}

	/**
	 * Force session validation (useful for debugging)
	 */
	async forceSessionValidation() {
		console.log('🔄 Forcing session validation...');
		return await this.validateAndRestoreSession();
	}
}

// Create singleton instance
export const pwaSessionManager = new PWASessionManager();

// Auto-initialize in browser environment
if (browser) {
	// Initialize after a short delay to ensure other stores are ready
	setTimeout(() => {
		pwaSessionManager.init();
	}, 100);
}