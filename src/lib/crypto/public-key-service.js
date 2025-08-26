/**
 * @fileoverview Public key management service for QryptChat
 * Handles storing and retrieving user public keys from the database
 */

import { supabase } from '$lib/supabase.js';
import { asymmetricEncryption } from './asymmetric-encryption.js';

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

	/**
	 * Upload current user's public key to the database
	 * @returns {Promise<boolean>} Success status
	 */
	async uploadMyPublicKey() {
		try {
			// Get current user
			const { data: { user }, error: userError } = await supabase.auth.getUser();
			if (userError || !user) {
				throw new Error('User not authenticated');
			}

			// Get our public key
			const publicKey = await asymmetricEncryption.getPublicKey();
			if (!publicKey) {
				throw new Error('No public key available');
			}

			// Upload to database
			const { data, error } = await supabase.rpc('upsert_user_public_key', {
				target_user_id: user.id,
				public_key_param: publicKey,
				key_type_param: 'ECDH-P256'
			});

			if (error) {
				throw error;
			}

			console.log('🔑 ✅ Uploaded public key to database');
			return true;

		} catch (error) {
			console.error('🔑 ❌ Failed to upload public key:', error);
			return false;
		}
	}

	/**
	 * Get a user's public key from database
	 * @param {string} userId - User ID
	 * @returns {Promise<string|null>} Public key or null
	 */
	async getUserPublicKey(userId) {
		try {
			// Check cache first
			if (this.cache.has(userId)) {
				return this.cache.get(userId);
			}

			// Fetch from database
			const { data, error } = await supabase.rpc('get_user_public_key', {
				target_user_id: userId,
				key_type_param: 'ECDH-P256'
			});

			if (error) {
				throw error;
			}

			if (data) {
				// Cache the result
				this.cache.set(userId, data);
				console.log(`🔑 Retrieved public key for user ${userId}`);
				return data;
			}

			console.log(`🔑 No public key found for user ${userId}`);
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
		const results = new Map();

		// Process in parallel
		const promises = userIds.map(async (userId) => {
			const publicKey = await this.getUserPublicKey(userId);
			if (publicKey) {
				results.set(userId, publicKey);
			}
		});

		await Promise.all(promises);
		return results;
	}

	/**
	 * Get public keys for all participants in a conversation
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<Map<string, string>>} Map of userId -> publicKey
	 */
	async getConversationParticipantKeys(conversationId) {
		try {
			// Get conversation participants
			const { data: participants, error } = await supabase
				.from('conversation_participants')
				.select('user_id')
				.eq('conversation_id', conversationId);

			if (error) {
				throw error;
			}

			if (!participants || participants.length === 0) {
				console.log(`🔑 No participants found for conversation ${conversationId}`);
				return new Map();
			}

			const userIds = participants.map(p => p.user_id);
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
	 * Get current user's public key from our local asymmetric encryption
	 * @returns {Promise<string|null>} Public key or null
	 */
	async getMyPublicKey() {
		try {
			return await asymmetricEncryption.getPublicKey();
		} catch (error) {
			console.error('🔑 ❌ Failed to get my public key:', error);
			return null;
		}
	}

	/**
	 * Initialize user's encryption keys and upload public key
	 * This should be called when user first logs in or registers
	 * @returns {Promise<boolean>} Success status
	 */
	async initializeUserEncryption() {
		try {
			console.log('🔑 Initializing user encryption...');

			// Initialize asymmetric encryption (generates keys if needed)
			await asymmetricEncryption.initialize();

			// Ensure we have user keys
			await asymmetricEncryption.getUserKeys();

			// Upload public key to database
			const uploaded = await this.uploadMyPublicKey();

			if (uploaded) {
				console.log('🔑 ✅ User encryption initialized successfully');
				return true;
			} else {
				console.log('🔑 ⚠️ User encryption initialized but public key upload failed');
				return false;
			}

		} catch (error) {
			console.error('🔑 ❌ Failed to initialize user encryption:', error);
			return false;
		}
	}
}

// Create and export singleton instance
export const publicKeyService = new PublicKeyService();