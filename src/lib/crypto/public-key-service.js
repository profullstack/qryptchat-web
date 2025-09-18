/**
 * @fileoverview Public key management service for QryptChat
 * Handles storing and retrieving user public keys from the database
 */

import { postQuantumEncryption } from './post-quantum-encryption.js';
import { browser } from '$app/environment';
import { Base64 } from './index.js';

/**
 * Public key management service
 */
export class PublicKeyService {
	constructor() {
		this.cache = new Map(); // userId -> publicKey cache
		this.isInitialized = false;
		
		// Public key size constants for algorithm detection
		this.ML_KEM_768_PUBLIC_KEY_SIZE = 1184; // bytes
		this.ML_KEM_1024_PUBLIC_KEY_SIZE = 1568; // bytes
	}

	/**
	 * Initialize the service
	 */
	async initialize() {
		this.isInitialized = true;
		console.log('🔑 Public key service initialized');
	}

	// uploadMyPublicKey method removed - public keys are auto-generated during account creation
	// and should not be uploaded manually for proper E2E encryption security

	/**
	 * Get a user's public key from database
	 * @param {string} userId - User ID
	 * @returns {Promise<string|null>} Public key or null
	 */
	async getUserPublicKey(userId) {
		try {
			// Check cache first
			if (this.cache.has(userId)) {
				console.log(`🔑 Using cached public key for user ${userId}`);
				return this.cache.get(userId);
			}

			console.log(`🔑 Fetching public key for user ${userId} via API`);

			// Fetch via API endpoint (SvelteKit handles auth via cookies/session)
			const response = await fetch(`/api/crypto/public-keys?user_id=${encodeURIComponent(userId)}`);
			
			if (!response.ok) {
				if (response.status === 404) {
					console.log(`🔑 ⚠️ No public key found for user ${userId}`);
					return null;
				}
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			
			console.log(`🔑 API response for user ${userId}:`, {
				hasPublicKey: !!data.public_key,
				dataType: typeof data.public_key,
				dataLength: data.public_key ? data.public_key.length : 0
			});

			if (data.public_key) {
				// Cache the result and ensure it's ML-KEM-1024 format
				const publicKey = data.public_key;
				
				// Check if we need to validate the key format
				try {
					const keyBytes = Base64.decode(publicKey);
					console.log(`🔑 Public key length for user ${userId}: ${keyBytes.length} bytes`);
					
					if (keyBytes.length === this.ML_KEM_768_PUBLIC_KEY_SIZE) {
						console.warn(`🔑 ⚠️ Detected ML-KEM-768 public key format for user ${userId} - ML-KEM-1024 will be used for all new messages`);
						console.warn(`🔑 ⚠️ This user needs to regenerate their keys to ML-KEM-1024 format for optimal compatibility`);
						
						// We still cache the key because we need it for encryption
						// The encryption service will handle using ML-KEM-1024 regardless
					} else if (keyBytes.length === this.ML_KEM_1024_PUBLIC_KEY_SIZE) {
						console.log(`🔑 ✅ Verified ML-KEM-1024 public key format for user ${userId}`);
					} else {
						console.warn(`🔑 ⚠️ Unknown public key format for user ${userId} (${keyBytes.length} bytes)`);
						console.warn(`🔑 ⚠️ This may cause encryption/decryption issues`);
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					console.warn(`🔑 ⚠️ Could not validate public key format for user ${userId}: ${errorMessage}`);
				}
				
				this.cache.set(userId, publicKey);
				console.log(`🔑 ✅ Retrieved and cached public key for user ${userId}`);
				return publicKey;
			}

			console.log(`🔑 ⚠️ No public key found for user ${userId} in API response`);
			return null;

		} catch (error) {
			console.error(`🔑 ❌ Failed to get public key for user ${userId}:`, error);
			return null;
		}
	}

	/**
	 * Get public keys for multiple users
	 * @param {string[]} userIds - Array of user IDs
	 * @returns {Promise<Map<string, string>>} Map of userId -> publicKey
	 */
	async getMultipleUserPublicKeys(userIds) {
		try {
			console.log(`🔑 Fetching public keys for ${userIds.length} users via API`);

			// Use the bulk API endpoint for better performance (SvelteKit handles auth via cookies/session)
			const response = await fetch('/api/crypto/public-keys', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					user_ids: userIds
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			const results = new Map();

			// Process the results and cache them
			for (const [userId, publicKey] of Object.entries(data.public_keys)) {
				if (publicKey) {
					results.set(userId, publicKey);
					this.cache.set(userId, publicKey);
					console.log(`🔑 ✅ Retrieved and cached public key for user ${userId}`);
				} else {
					console.log(`🔑 ⚠️ No public key found for user ${userId}`);
				}
			}

			console.log(`🔑 Successfully fetched ${results.size} public keys out of ${userIds.length} requested`);
			return results;

		} catch (error) {
			console.error('🔑 ❌ Failed to get multiple public keys, falling back to individual requests:', error);
			
			// Fallback to individual requests
			const results = new Map();
			const promises = userIds.map(async (userId) => {
				const publicKey = await this.getUserPublicKey(userId);
				if (publicKey) {
					results.set(userId, publicKey);
				}
			});

			await Promise.all(promises);
			return results;
		}
	}

	/**
	 * Get public keys for all participants in a conversation
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<Map<string, string>>} Map of userId -> publicKey
	 */
	async getConversationParticipantKeys(conversationId) {
		try {
			// Get conversation participants via API (SvelteKit handles auth via cookies/session)
			const response = await fetch(`/api/chat/conversations/${conversationId}/participants`);
			
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			const participants = data.participants || [];

			if (participants.length === 0) {
				console.log(`🔑 No participants found for conversation ${conversationId}`);
				return new Map();
			}

			const userIds = participants.map(/** @param {any} p */ (p) => p.user_id);
			console.log(`🔑 Getting public keys for ${userIds.length} participants in conversation ${conversationId}`);

			return await this.getMultipleUserPublicKeys(userIds);

		} catch (error) {
			console.error(`🔑 ❌ Failed to get participant keys for conversation ${conversationId}:`, error);
			return new Map();
		}
	}

	/**
	 * Clear cached public keys
	 */
	clearCache() {
		this.cache.clear();
		console.log('🔑 Cleared public key cache');
	}

	/**
	 * Remove a specific user's key from cache
	 * @param {string} userId - User ID
	 */
	removeCachedKey(userId) {
		this.cache.delete(userId);
		console.log(`🔑 Removed cached key for user ${userId}`);
	}

	/**
	 * Check if we have a public key for a user (cached or database)
	 * @param {string} userId - User ID
	 * @returns {Promise<boolean>} Whether key exists
	 */
	async hasUserPublicKey(userId) {
		if (this.cache.has(userId)) {
			return true;
		}

		const publicKey = await this.getUserPublicKey(userId);
		return !!publicKey;
	}

	/**
	 * Get current user's public key from our local post-quantum encryption
	 * @returns {Promise<string|null>} Public key or null
	 */
	async getMyPublicKey() {
		try {
			// Always return ML-KEM-1024 public key for consistency
			return await postQuantumEncryption.getPublicKey();
		} catch (error) {
			console.error('🔑 ❌ Failed to get my public key:', error);
			return null;
		}
	}
	
	/**
	 * Detect whether a public key is ML-KEM-768 or ML-KEM-1024 format
	 * @param {string} publicKey - Base64 encoded public key
	 * @returns {string} 'ML-KEM-768', 'ML-KEM-1024', or 'unknown'
	 */
	detectKeyFormat(publicKey) {
		try {
			const keyBytes = Base64.decode(publicKey);
			
			if (keyBytes.length === this.ML_KEM_768_PUBLIC_KEY_SIZE) {
				return 'ML-KEM-768';
			} else if (keyBytes.length === this.ML_KEM_1024_PUBLIC_KEY_SIZE) {
				return 'ML-KEM-1024';
			} else {
				return 'unknown';
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('🔑 ❌ Failed to detect key format:', errorMessage);
			return 'unknown';
		}
	}

	/**
	 * Initialize user's encryption keys locally
	 * Public keys are auto-generated during account creation, so no upload needed
	 * @returns {Promise<boolean>} Success status
	 */
	async initializeUserEncryption() {
	 try {
	 	console.log('🔑 Initializing user post-quantum encryption...');

	 	// Initialize post-quantum encryption (generates keys if needed)
	 	await postQuantumEncryption.initialize();

	 	// Ensure we have ML-KEM-1024 user keys
	 	const userKeys = await postQuantumEncryption.getUserKeys();
	 	
	 	// Validate that we're using ML-KEM-1024 keys
	 	try {
	 		const keyBytes = Base64.decode(userKeys.publicKey);
	 		
	 		if (keyBytes.length === this.ML_KEM_1024_PUBLIC_KEY_SIZE) {
	 			console.log('🔑 ✅ Confirmed user has ML-KEM-1024 keys as required');
	 		} else if (keyBytes.length === this.ML_KEM_768_PUBLIC_KEY_SIZE) {
	 			console.warn('🔑 ⚠️ User has ML-KEM-768 keys but ML-KEM-1024 is required');
	 			console.warn('🔑 ⚠️ Regenerating keys to ML-KEM-1024 format for compatibility');
	 			
	 			// Regenerate keys to ensure ML-KEM-1024 format
	 			await postQuantumEncryption.clearUserKeys();
	 			await postQuantumEncryption.generateUserKeys();
	 			console.log('🔑 ✅ Successfully regenerated ML-KEM-1024 keys');
	 		} else {
	 			console.warn(`🔑 ⚠️ Unknown key format detected (${keyBytes.length} bytes)`);
	 		}
	 	} catch (keyError) {
	 		console.error('🔑 ❌ Failed to validate key format:', keyError);
	 	}

	 	console.log('🔑 ✅ User post-quantum encryption initialized successfully');
	 	console.log('🔑 ℹ️ Public key should already exist in database from account creation');
	 	return true;

		} catch (error) {
			console.error('🔑 ❌ Failed to initialize user post-quantum encryption:', error);
			return false;
		}
	}
}

// Create and export singleton instance
export const publicKeyService = new PublicKeyService();