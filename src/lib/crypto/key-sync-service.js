/**
 * @fileoverview Key synchronization service for QryptChat
 * Handles syncing client-side generated public keys to the database
 */

import { postQuantumEncryption } from './post-quantum-encryption.js';

/**
 * Service for synchronizing public keys between client and server
 */
export class KeySyncService {
	constructor() {
		this.syncInProgress = false;
		this.lastSyncAttempt = null;
		this.maxRetries = 3;
		this.retryDelay = 1000; // 1 second
	}

	/**
	 * Sync user's public key to the database
	 * @param {boolean} force - Force sync even if recently attempted
	 * @returns {Promise<{success: boolean, error?: string}>}
	 */
	async syncPublicKey(force = false) {
		if (typeof window === 'undefined') {
			return { success: false, error: 'Not in browser environment' };
		}

		// Prevent concurrent sync attempts
		if (this.syncInProgress && !force) {
			console.log('🔑 Key sync already in progress, skipping');
			return { success: false, error: 'Sync already in progress' };
		}

		// Rate limiting - don't sync more than once per minute unless forced
		const now = Date.now();
		if (!force && this.lastSyncAttempt && (now - this.lastSyncAttempt) < 60000) {
			console.log('🔑 Key sync rate limited, skipping');
			return { success: false, error: 'Rate limited' };
		}

		this.syncInProgress = true;
		this.lastSyncAttempt = now;

		try {
			// Ensure post-quantum encryption is initialized
			if (!postQuantumEncryption.isInitialized) {
				console.log('🔑 Initializing post-quantum encryption for key sync');
				await postQuantumEncryption.initialize();
			}

			// Get the user's public key
			const publicKey = await postQuantumEncryption.getPublicKey();
			if (!publicKey) {
				throw new Error('No public key available to sync');
			}

			console.log('🔑 Syncing public key to database...');

			// Sync to database with retry logic
			let lastError = null;
			for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
				try {
					const response = await fetch('/api/crypto/public-keys', {
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json'
						},
						credentials: 'include', // Include cookies for authentication
						body: JSON.stringify({
							public_key: publicKey,
							key_type: 'ML-KEM-1024'
						})
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(errorData.error || `HTTP ${response.status}`);
					}

					const result = await response.json();
					console.log('🔑 ✅ Public key synced successfully:', result.message);
					
					this.syncInProgress = false;
					return { success: true };

				} catch (error) {
					lastError = error;
					const errorMessage = error instanceof Error ? error.message : String(error);
					console.warn(`🔑 Key sync attempt ${attempt}/${this.maxRetries} failed:`, errorMessage);
					
					if (attempt < this.maxRetries) {
						// Wait before retrying
						await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
					}
				}
			}

			// All attempts failed
			throw lastError;

		} catch (error) {
			console.error('🔑 ❌ Failed to sync public key:', error);
			this.syncInProgress = false;
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error during key sync'
			};
		}
	}

	/**
	 * Check if user needs key sync (has keys locally but not in database)
	 * @returns {Promise<boolean>}
	 */
	async needsKeySync() {
		if (typeof window === 'undefined') return false;

		try {
			// Check if we have local keys
			if (!postQuantumEncryption.isInitialized) {
				await postQuantumEncryption.initialize();
			}

			const publicKey = await postQuantumEncryption.getPublicKey();
			if (!publicKey) {
				console.log('🔑 No local public key found, sync not needed');
				return false;
			}

			// Check if key exists in database by trying to fetch it
			// This is a simple check - if the API returns our own key, it's synced
			const response = await fetch('/api/crypto/public-keys/all', {
				method: 'GET',
				credentials: 'include'
			});

			if (!response.ok) {
				console.log('🔑 Cannot check database keys, assuming sync needed');
				return true;
			}

			const data = await response.json();
			const currentUserId = this.getCurrentUserId();
			
			if (!currentUserId) {
				console.log('🔑 No current user ID, cannot determine sync status');
				return false;
			}

			// Check if our key exists in the database AND matches the local key.
			// Presence alone isn't enough: after switching browsers / rotating keys
			// the DB still holds the OLD public key, so a presence-only check would
			// skip the sync and leave everyone encrypting to a dead key.
			const dbKey = data.public_keys && data.public_keys[currentUserId];

			if (!dbKey) {
				console.log('🔑 Public key not found in database, sync needed');
				return true;
			}

			if (dbKey !== publicKey) {
				console.log('🔑 Database public key differs from local key (rotated/new device), sync needed');
				return true;
			}

			console.log('🔑 Public key already synced to database');
			return false;

		} catch (error) {
			console.error('🔑 Error checking key sync status:', error);
			// If we can't check, assume sync is needed to be safe
			return true;
		}
	}

	/**
	 * Get current user ID from localStorage
	 * @returns {string|null}
	 * @private
	 */
	getCurrentUserId() {
		try {
			const storedUser = localStorage.getItem('qrypt_user');
			if (storedUser) {
				const user = JSON.parse(storedUser);
				return user.id;
			}
		} catch (error) {
			console.error('🔑 Error getting current user ID:', error);
		}
		return null;
	}

	/**
	 * Auto-sync keys on login if needed
	 * This handles both scenarios:
	 * 1. User has local keys but not in database -> sync to database
	 * 2. User has keys in database but not locally -> pull from database (future feature)
	 * @returns {Promise<{success: boolean, error?: string}>}
	 */
	async autoSyncOnLogin() {
		try {
			console.log('🔑 Checking if auto-sync is needed on login...');
			
			// Check if we have local keys
			if (!postQuantumEncryption.isInitialized) {
				await postQuantumEncryption.initialize();
			}

			const localPublicKey = await postQuantumEncryption.getPublicKey();
			const hasLocalKeys = !!localPublicKey;

			console.log('🔑 Local keys status:', { hasLocalKeys });

			if (hasLocalKeys) {
				// User has local keys - check if they need to be synced to database
				const needsSync = await this.needsKeySync();
				if (needsSync) {
					console.log('🔑 Auto-syncing local keys to database...');
					return await this.syncPublicKey(false);
				} else {
					console.log('🔑 Local keys already synced to database');
					return { success: true };
				}
			} else {
				// User has no local keys - this could be a new browser
				// In the future, we could pull keys from database here
				// For now, just log and let the user generate new keys if needed
				console.log('🔑 No local keys found - user may need to generate keys or this is a new browser');
				console.log('🔑 Note: Key pulling from database is not yet implemented');
				return { success: true };
			}

		} catch (error) {
			console.error('🔑 Error during auto-sync on login:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Auto-sync failed'
			};
		}
	}

	/**
	 * Force sync public key (ignores rate limiting)
	 * @returns {Promise<{success: boolean, error?: string}>}
	 */
	async forceSyncPublicKey() {
		return await this.syncPublicKey(true);
	}
}

// Create and export singleton instance
export const keySyncService = new KeySyncService();