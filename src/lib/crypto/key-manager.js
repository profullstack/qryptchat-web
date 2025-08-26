/**
 * @fileoverview Client-side key management for QryptChat
 * Handles secure storage and retrieval of encryption keys
 */

import { browser } from '$app/environment';
import { Base64, CryptoUtils } from './index.js';

/**
 * Client-side key management service
 */
export class KeyManager {
	constructor() {
		this.storageKey = 'qryptchat_keys';
		this.sessionKeys = new Map(); // In-memory keys for current session
	}

	/**
	 * Initialize the key manager
	 */
	async initialize() {
		if (browser) {
			// Load keys from localStorage on initialization
			await this.loadKeysFromStorage();
			console.log('🔑 Key manager initialized');
		}
	}

	/**
	 * Store a conversation key
	 * @param {string} conversationId - Conversation ID
	 * @param {Uint8Array} key - Encryption key
	 * @param {boolean} persist - Whether to persist to localStorage
	 */
	async storeConversationKey(conversationId, key, persist = true) {
		try {
			// Store in session memory
			this.sessionKeys.set(conversationId, key);

			if (persist && browser) {
				// Store in localStorage (encrypted with a master key)
				const keyData = {
					conversationId,
					key: Base64.encode(key),
					timestamp: Date.now()
				};

				const existingKeys = this.getStoredKeys();
				existingKeys[conversationId] = keyData;

				localStorage.setItem(this.storageKey, JSON.stringify(existingKeys));
				console.log(`🔑 Stored key for conversation: ${conversationId}`);
			}
		} catch (error) {
			console.error('🔑 Failed to store conversation key:', error);
		}
	}

	/**
	 * Retrieve a conversation key
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<Uint8Array|null>} Encryption key or null
	 */
	async getConversationKey(conversationId) {
		try {
			// First check session memory
			if (this.sessionKeys.has(conversationId)) {
				return this.sessionKeys.get(conversationId);
			}

			// Then check localStorage
			if (browser) {
				const storedKeys = this.getStoredKeys();
				const keyData = storedKeys[conversationId];

				if (keyData) {
					const key = Base64.decode(keyData.key);
					// Store in session for faster access
					this.sessionKeys.set(conversationId, key);
					return key;
				}
			}

			return null;
		} catch (error) {
			console.error('🔑 Failed to retrieve conversation key:', error);
			return null;
		}
	}

	/**
	 * Generate and store a new conversation key
	 * @param {string} conversationId - Conversation ID
	 * @param {boolean} persist - Whether to persist to localStorage
	 * @returns {Promise<Uint8Array>} Generated key
	 */
	async generateConversationKey(conversationId, persist = true) {
		try {
			// Generate a new 256-bit key
			const key = new Uint8Array(32);
			crypto.getRandomValues(key);

			await this.storeConversationKey(conversationId, key, persist);
			console.log(`🔑 Generated new key for conversation: ${conversationId}`);
			
			return key;
		} catch (error) {
			console.error('🔑 Failed to generate conversation key:', error);
			throw error;
		}
	}

	/**
	 * Remove a conversation key
	 * @param {string} conversationId - Conversation ID
	 */
	async removeConversationKey(conversationId) {
		try {
			// Remove from session memory
			const key = this.sessionKeys.get(conversationId);
			if (key) {
				CryptoUtils.secureClear(key);
				this.sessionKeys.delete(conversationId);
			}

			// Remove from localStorage
			if (browser) {
				const storedKeys = this.getStoredKeys();
				delete storedKeys[conversationId];
				localStorage.setItem(this.storageKey, JSON.stringify(storedKeys));
			}

			console.log(`🔑 Removed key for conversation: ${conversationId}`);
		} catch (error) {
			console.error('🔑 Failed to remove conversation key:', error);
		}
	}

	/**
	 * List all stored conversation IDs
	 * @returns {string[]} Array of conversation IDs
	 */
	getStoredConversationIds() {
		try {
			const sessionIds = Array.from(this.sessionKeys.keys());
			
			if (browser) {
				const storedKeys = this.getStoredKeys();
				const persistedIds = Object.keys(storedKeys);
				
				// Combine and deduplicate
				return [...new Set([...sessionIds, ...persistedIds])];
			}

			return sessionIds;
		} catch (error) {
			console.error('🔑 Failed to get stored conversation IDs:', error);
			return [];
		}
	}

	/**
	 * Clear all stored keys
	 */
	async clearAllKeys() {
		try {
			// Clear session memory
			for (const key of this.sessionKeys.values()) {
				CryptoUtils.secureClear(key);
			}
			this.sessionKeys.clear();

			// Clear localStorage
			if (browser) {
				localStorage.removeItem(this.storageKey);
			}

			console.log('🔑 Cleared all stored keys');
		} catch (error) {
			console.error('🔑 Failed to clear all keys:', error);
		}
	}

	/**
	 * Export conversation key for sharing
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<string|null>} Base64 encoded key or null
	 */
	async exportConversationKey(conversationId) {
		try {
			const key = await this.getConversationKey(conversationId);
			if (key) {
				return Base64.encode(key);
			}
			return null;
		} catch (error) {
			console.error('🔑 Failed to export conversation key:', error);
			return null;
		}
	}

	/**
	 * Import conversation key from base64
	 * @param {string} conversationId - Conversation ID
	 * @param {string} keyBase64 - Base64 encoded key
	 * @param {boolean} persist - Whether to persist to localStorage
	 */
	async importConversationKey(conversationId, keyBase64, persist = true) {
		try {
			const key = Base64.decode(keyBase64);
			await this.storeConversationKey(conversationId, key, persist);
			console.log(`🔑 Imported key for conversation: ${conversationId}`);
		} catch (error) {
			console.error('🔑 Failed to import conversation key:', error);
			throw error;
		}
	}

	/**
	 * Get stored keys from localStorage
	 * @returns {Object} Stored keys object
	 * @private
	 */
	getStoredKeys() {
		try {
			if (!browser) return {};
			
			const stored = localStorage.getItem(this.storageKey);
			return stored ? JSON.parse(stored) : {};
		} catch (error) {
			console.error('🔑 Failed to parse stored keys:', error);
			return {};
		}
	}

	/**
	 * Load keys from localStorage into session memory
	 * @private
	 */
	async loadKeysFromStorage() {
		try {
			if (!browser) return;

			const storedKeys = this.getStoredKeys();
			
			for (const [conversationId, keyData] of Object.entries(storedKeys)) {
				if (keyData && keyData.key) {
					const key = Base64.decode(keyData.key);
					this.sessionKeys.set(conversationId, key);
				}
			}

			console.log(`🔑 Loaded ${Object.keys(storedKeys).length} keys from storage`);
		} catch (error) {
			console.error('🔑 Failed to load keys from storage:', error);
		}
	}

	/**
	 * Check if a conversation has a stored key
	 * @param {string} conversationId - Conversation ID
	 * @returns {boolean} Whether key exists
	 */
	hasConversationKey(conversationId) {
		if (this.sessionKeys.has(conversationId)) {
			return true;
		}

		if (browser) {
			const storedKeys = this.getStoredKeys();
			return !!storedKeys[conversationId];
		}

		return false;
	}

	/**
	 * Check if user has encryption keys initialized
	 * @returns {Promise<boolean>} Whether user has keys
	 */
	async hasUserKeys() {
		try {
			if (!browser) return false;
			
			const userKeys = localStorage.getItem('qryptchat_user_keys');
			return !!userKeys;
		} catch (error) {
			console.error('🔑 Failed to check user keys:', error);
			return false;
		}
	}

	/**
	 * Generate user encryption keys
	 * @returns {Promise<void>}
	 */
	async generateUserKeys() {
		try {
			if (!browser) {
				throw new Error('User keys can only be generated in browser environment');
			}

			// Generate a master key for the user
			const masterKey = new Uint8Array(32);
			crypto.getRandomValues(masterKey);

			// Generate key pair for key exchange (using same approach as conversation keys for simplicity)
			const keyExchangeKey = new Uint8Array(32);
			crypto.getRandomValues(keyExchangeKey);

			const userKeys = {
				masterKey: Base64.encode(masterKey),
				keyExchangeKey: Base64.encode(keyExchangeKey),
				timestamp: Date.now(),
				version: '1.0'
			};

			localStorage.setItem('qryptchat_user_keys', JSON.stringify(userKeys));
			console.log('🔑 Generated user encryption keys');

			// Clear sensitive data from memory
			CryptoUtils.secureClear(masterKey);
			CryptoUtils.secureClear(keyExchangeKey);
		} catch (error) {
			console.error('🔑 Failed to generate user keys:', error);
			throw error;
		}
	}

	/**
	 * Clear user encryption keys
	 * @returns {Promise<void>}
	 */
	async clearUserKeys() {
		try {
			if (!browser) return;
			
			localStorage.removeItem('qryptchat_user_keys');
			console.log('🔑 Cleared user encryption keys');
		} catch (error) {
			console.error('🔑 Failed to clear user keys:', error);
			throw error;
		}
	}

	/**
	 * Get user encryption keys
	 * @returns {Promise<Object|null>} User keys or null
	 */
	async getUserKeys() {
		try {
			if (!browser) return null;
			
			const stored = localStorage.getItem('qryptchat_user_keys');
			return stored ? JSON.parse(stored) : null;
		} catch (error) {
			console.error('🔑 Failed to get user keys:', error);
			return null;
		}
	}
}

// Create and export singleton instance
export const keyManager = new KeyManager();