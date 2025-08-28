/**
 * @fileoverview Public key management service for QryptChat
 * Handles storing and retrieving user public keys from the database
 */

import { postQuantumEncryption } from './post-quantum-encryption.js';
import { browser } from '$app/environment';

/**
 * Public key management service
 */
export class PublicKeyService {
	constructor() {
		this.cache = new Map(); // userId -> publicKey cache
		this.isInitialized = false;
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
				// Cache the result
				this.cache.set(userId, data.public_key);
				console.log(`🔑 ✅ Retrieved and cached public key for user ${userId}`);
				return data.public_key;
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
			return await postQuantumEncryption.getPublicKey();
		} catch (error) {
			console.error('🔑 ❌ Failed to get my public key:', error);
			return null;
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

			// Ensure we have user keys
			await postQuantumEncryption.getUserKeys();

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