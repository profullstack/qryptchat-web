/**
 * @fileoverview PWA Diagnostics utility for debugging session and connection issues
 * Specifically designed to help diagnose Linux/KDE/Wayland PWA session loss problems
 */

import { browser } from '$app/environment';
import { auth } from '$lib/stores/auth.js';
import { chat, wsChat } from '$lib/stores/chat.js';
import { pwaSessionManager } from './pwa-session-manager.js';

/**
 * PWA Diagnostics class for debugging session issues
 */
export class PWADiagnostics {
	constructor() {
		this.diagnosticData = {
			timestamp: Date.now(),
			environment: {},
			session: {},
			websocket: {},
			pwa: {},
			browser: {},
			errors: []
		};
	}

	/**
	 * Run comprehensive PWA diagnostics
	 */
	async runDiagnostics() {
		console.log('🔍 Running PWA diagnostics...');
		
		try {
			await this.collectEnvironmentInfo();
			await this.collectSessionInfo();
			await this.collectWebSocketInfo();
			await this.collectPWAInfo();
			await this.collectBrowserInfo();
			
			const report = this.generateReport();
			console.log('📊 PWA Diagnostics Report:', report);
			
			return report;
		} catch (error) {
			console.error('❌ Diagnostics failed:', error);
			this.diagnosticData.errors.push({
				type: 'diagnostics_error',
				message: error.message,
				timestamp: Date.now()
			});
			return this.diagnosticData;
		}
	}

	/**
	 * Collect environment information
	 */
	async collectEnvironmentInfo() {
		if (!browser) return;

		this.diagnosticData.environment = {
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			language: navigator.language,
			cookieEnabled: navigator.cookieEnabled,
			onLine: navigator.onLine,
			connection: navigator.connection ? {
				effectiveType: navigator.connection.effectiveType,
				downlink: navigator.connection.downlink,
				rtt: navigator.connection.rtt
			} : null,
			url: window.location.href,
			protocol: window.location.protocol,
			host: window.location.host,
			timestamp: Date.now()
		};

		// Detect Linux/KDE/Wayland specifically
		const ua = navigator.userAgent.toLowerCase();
		this.diagnosticData.environment.isLinux = ua.includes('linux');
		this.diagnosticData.environment.isKDE = ua.includes('kde') || process?.env?.XDG_CURRENT_DESKTOP === 'KDE';
		this.diagnosticData.environment.isWayland = process?.env?.XDG_SESSION_TYPE === 'wayland';
	}

	/**
	 * Collect session information
	 */
	async collectSessionInfo() {
		if (!browser) return;

		try {
			// Check localStorage session
			const storedSession = localStorage.getItem('qrypt_session');
			const storedUser = localStorage.getItem('qrypt_user');
			const appState = localStorage.getItem('qrypt_app_state');

			this.diagnosticData.session = {
				hasStoredSession: !!storedSession,
				hasStoredUser: !!storedUser,
				hasAppState: !!appState,
				sessionValid: false,
				sessionExpired: false,
				refreshTokenAvailable: false,
				timestamp: Date.now()
			};

			if (storedSession) {
				try {
					const session = JSON.parse(storedSession);
					this.diagnosticData.session.hasAccessToken = !!session.access_token;
					this.diagnosticData.session.hasRefreshToken = !!session.refresh_token;
					this.diagnosticData.session.refreshTokenAvailable = !!session.refresh_token;
					
					if (session.expires_at) {
						const expiresAt = new Date(session.expires_at * 1000);
						const now = new Date();
						this.diagnosticData.session.sessionExpired = expiresAt <= now;
						this.diagnosticData.session.sessionValid = expiresAt > now;
						this.diagnosticData.session.expiresAt = expiresAt.toISOString();
						this.diagnosticData.session.timeUntilExpiry = expiresAt.getTime() - now.getTime();
					}
				} catch (error) {
					this.diagnosticData.session.sessionParseError = error.message;
					this.diagnosticData.errors.push({
						type: 'session_parse_error',
						message: error.message,
						timestamp: Date.now()
					});
				}
			}

			// Test session validation
			try {
				const sessionResult = await auth.getCurrentSession();
				this.diagnosticData.session.authStoreSessionValid = !sessionResult.error;
				this.diagnosticData.session.authStoreError = sessionResult.error;
			} catch (error) {
				this.diagnosticData.session.authStoreError = error.message;
				this.diagnosticData.errors.push({
					type: 'auth_store_error',
					message: error.message,
					timestamp: Date.now()
				});
			}

		} catch (error) {
			this.diagnosticData.errors.push({
				type: 'session_collection_error',
				message: error.message,
				timestamp: Date.now()
			});
		}
	}

	/**
	 * Collect WebSocket information
	 */
	async collectWebSocketInfo() {
		try {
			const wsState = wsChat.getState();
			const ws = wsChat.getWebSocket();

			this.diagnosticData.websocket = {
				connected: wsState?.connected || false,
				authenticated: wsState?.authenticated || false,
				loading: wsState?.loading || false,
				error: wsState?.error || null,
				hasWebSocket: !!ws,
				readyState: ws?.readyState || null,
				readyStateText: this.getWebSocketReadyStateText(ws?.readyState),
				isHealthy: wsChat.isHealthy ? wsChat.isHealthy() : false,
				url: ws?.url || null,
				protocol: ws?.protocol || null,
				timestamp: Date.now()
			};

			// Test WebSocket URL construction
			try {
				const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				const host = window.location.host;
				const wsUrl = `${protocol}//${host}/ws`;
				this.diagnosticData.websocket.expectedUrl = wsUrl;
				this.diagnosticData.websocket.urlMatch = ws?.url === wsUrl;
			} catch (error) {
				this.diagnosticData.websocket.urlConstructionError = error.message;
			}

		} catch (error) {
			this.diagnosticData.errors.push({
				type: 'websocket_collection_error',
				message: error.message,
				timestamp: Date.now()
			});
		}
	}

	/**
	 * Collect PWA information
	 */
	async collectPWAInfo() {
		if (!browser) return;

		try {
			this.diagnosticData.pwa = {
				isStandalone: window.matchMedia('(display-mode: standalone)').matches,
				hasServiceWorker: 'serviceWorker' in navigator,
				hasManifest: !!document.querySelector('link[rel="manifest"]'),
				visibilityState: document.visibilityState,
				hidden: document.hidden,
				hasFocus: document.hasFocus(),
				timestamp: Date.now()
			};

			// Check PWA session manager state
			if (pwaSessionManager) {
				const appState = pwaSessionManager.getAppState();
				this.diagnosticData.pwa.sessionManager = {
					isInitialized: pwaSessionManager.isInitialized,
					appState: appState,
					isProblematic: pwaSessionManager.isInProblematicState(),
					timestamp: Date.now()
				};
			}

			// Check service worker registration
			if ('serviceWorker' in navigator) {
				try {
					const registration = await navigator.serviceWorker.getRegistration();
					this.diagnosticData.pwa.serviceWorker = {
						registered: !!registration,
						active: !!registration?.active,
						waiting: !!registration?.waiting,
						installing: !!registration?.installing,
						scope: registration?.scope,
						updateViaCache: registration?.updateViaCache,
						timestamp: Date.now()
					};
				} catch (error) {
					this.diagnosticData.pwa.serviceWorkerError = error.message;
				}
			}

		} catch (error) {
			this.diagnosticData.errors.push({
				type: 'pwa_collection_error',
				message: error.message,
				timestamp: Date.now()
			});
		}
	}

	/**
	 * Collect browser-specific information
	 */
	async collectBrowserInfo() {
		if (!browser) return;

		try {
			this.diagnosticData.browser = {
				localStorage: {
					available: typeof Storage !== 'undefined',
					quota: null,
					usage: null
				},
				indexedDB: {
					available: 'indexedDB' in window,
				},
				webSocket: {
					available: 'WebSocket' in window,
				},
				visibilityAPI: {
					available: 'visibilityState' in document,
					prefixed: 'webkitVisibilityState' in document || 'mozVisibilityState' in document
				},
				timestamp: Date.now()
			};

			// Check storage quota if available
			if ('storage' in navigator && 'estimate' in navigator.storage) {
				try {
					const estimate = await navigator.storage.estimate();
					this.diagnosticData.browser.localStorage.quota = estimate.quota;
					this.diagnosticData.browser.localStorage.usage = estimate.usage;
				} catch (error) {
					this.diagnosticData.browser.localStorage.quotaError = error.message;
				}
			}

		} catch (error) {
			this.diagnosticData.errors.push({
				type: 'browser_collection_error',
				message: error.message,
				timestamp: Date.now()
			});
		}
	}

	/**
	 * Get WebSocket ready state as text
	 */
	getWebSocketReadyStateText(readyState) {
		switch (readyState) {
			case WebSocket.CONNECTING: return 'CONNECTING';
			case WebSocket.OPEN: return 'OPEN';
			case WebSocket.CLOSING: return 'CLOSING';
			case WebSocket.CLOSED: return 'CLOSED';
			default: return 'UNKNOWN';
		}
	}

	/**
	 * Generate diagnostic report
	 */
	generateReport() {
		const issues = this.identifyIssues();
		const recommendations = this.generateRecommendations(issues);

		return {
			...this.diagnosticData,
			issues,
			recommendations,
			summary: {
				totalIssues: issues.length,
				criticalIssues: issues.filter(i => i.severity === 'critical').length,
				warningIssues: issues.filter(i => i.severity === 'warning').length,
				infoIssues: issues.filter(i => i.severity === 'info').length,
				timestamp: Date.now()
			}
		};
	}

	/**
	 * Identify potential issues
	 */
	identifyIssues() {
		const issues = [];

		// Session issues
		if (!this.diagnosticData.session.hasStoredSession) {
			issues.push({
				type: 'no_stored_session',
				severity: 'critical',
				message: 'No session found in localStorage',
				category: 'session'
			});
		}

		if (this.diagnosticData.session.sessionExpired) {
			issues.push({
				type: 'session_expired',
				severity: 'critical',
				message: 'Session has expired',
				category: 'session'
			});
		}

		if (!this.diagnosticData.session.refreshTokenAvailable && this.diagnosticData.session.sessionExpired) {
			issues.push({
				type: 'no_refresh_token',
				severity: 'critical',
				message: 'No refresh token available for expired session',
				category: 'session'
			});
		}

		// WebSocket issues
		if (!this.diagnosticData.websocket.connected) {
			issues.push({
				type: 'websocket_disconnected',
				severity: 'critical',
				message: 'WebSocket is not connected',
				category: 'websocket'
			});
		}

		if (!this.diagnosticData.websocket.authenticated && this.diagnosticData.websocket.connected) {
			issues.push({
				type: 'websocket_not_authenticated',
				severity: 'critical',
				message: 'WebSocket connected but not authenticated',
				category: 'websocket'
			});
		}

		if (!this.diagnosticData.websocket.isHealthy) {
			issues.push({
				type: 'websocket_unhealthy',
				severity: 'warning',
				message: 'WebSocket connection appears unhealthy',
				category: 'websocket'
			});
		}

		// PWA-specific issues
		if (this.diagnosticData.environment.isLinux && this.diagnosticData.pwa.isStandalone) {
			issues.push({
				type: 'linux_pwa_detected',
				severity: 'info',
				message: 'Linux PWA detected - may be susceptible to session loss on minimize',
				category: 'pwa'
			});
		}

		if (this.diagnosticData.pwa.sessionManager?.isProblematic) {
			issues.push({
				type: 'session_manager_problematic',
				severity: 'warning',
				message: 'PWA session manager is in problematic state',
				category: 'pwa'
			});
		}

		// Browser compatibility issues
		if (!this.diagnosticData.browser.visibilityAPI.available) {
			issues.push({
				type: 'no_visibility_api',
				severity: 'warning',
				message: 'Visibility API not available - PWA state detection limited',
				category: 'browser'
			});
		}

		if (!this.diagnosticData.browser.webSocket.available) {
			issues.push({
				type: 'no_websocket_support',
				severity: 'critical',
				message: 'WebSocket not supported in this browser',
				category: 'browser'
			});
		}

		return issues;
	}

	/**
	 * Generate recommendations based on issues
	 */
	generateRecommendations(issues) {
		const recommendations = [];

		const hasSessionIssues = issues.some(i => i.category === 'session');
		const hasWebSocketIssues = issues.some(i => i.category === 'websocket');
		const isLinuxPWA = issues.some(i => i.type === 'linux_pwa_detected');

		if (hasSessionIssues) {
			recommendations.push({
				type: 'session_recovery',
				priority: 'high',
				message: 'Try refreshing the page or logging out and back in',
				actions: ['refresh_page', 'logout_login']
			});
		}

		if (hasWebSocketIssues) {
			recommendations.push({
				type: 'websocket_recovery',
				priority: 'high',
				message: 'Check network connection and try forcing reconnection',
				actions: ['check_network', 'force_reconnect']
			});
		}

		if (isLinuxPWA) {
			recommendations.push({
				type: 'linux_pwa_workaround',
				priority: 'medium',
				message: 'Consider keeping PWA visible or use browser version for better stability',
				actions: ['avoid_minimize', 'use_browser']
			});
		}

		return recommendations;
	}

	/**
	 * Export diagnostics data as JSON
	 */
	exportDiagnostics() {
		return JSON.stringify(this.diagnosticData, null, 2);
	}

	/**
	 * Save diagnostics to localStorage for debugging
	 */
	saveDiagnostics() {
		if (!browser) return;

		try {
			const timestamp = new Date().toISOString();
			const key = `qrypt_diagnostics_${timestamp}`;
			localStorage.setItem(key, this.exportDiagnostics());
			console.log(`💾 Diagnostics saved to localStorage as: ${key}`);
			return key;
		} catch (error) {
			console.error('❌ Failed to save diagnostics:', error);
			return null;
		}
	}
}

// Create singleton instance
export const pwaDiagnostics = new PWADiagnostics();

// Expose diagnostics globally for debugging
if (browser) {
	window.pwaDiagnostics = pwaDiagnostics;
	
	// Add keyboard shortcut for quick diagnostics (Ctrl+Shift+D)
	document.addEventListener('keydown', (event) => {
		if (event.ctrlKey && event.shiftKey && event.key === 'D') {
			event.preventDefault();
			pwaDiagnostics.runDiagnostics().then(report => {
				console.log('🔍 Quick PWA Diagnostics:', report);
				pwaDiagnostics.saveDiagnostics();
			});
		}
	});
}