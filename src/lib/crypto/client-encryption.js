/**
 * @fileoverview Simplified client-side encryption service for QryptChat
 * Uses only ChaCha20-Poly1305 with simple key management - KISS principle
 */

import { ChaCha20Poly1305, SecureRandom, Base64, CryptoUtils } from './index.js';

/**
 * Simplified client-side encryption service
 * Uses ChaCha20-Poly1305 with conversation-specific keys stored in localStorage
 */
export class ClientEncryptionService {
	constructor() {
		this.conversationKeys = new Map(); // conversationId -> encryption key
		this.isInitialized = false;
		this.storageKey = 'qryptchat_conversation_keys';
	}

	/**
	 * Initialize the encryption service
	 */
	async initialize() {
		if (typeof window !== 'undefined') {
			await this.loadKeysFromStorage();
		}
		this.isInitialized = true;
		console.log('🔐 Simplified encryption service initialized');
	}

	/**
	 * Generate or retrieve encryption key for a conversation
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<Uint8Array>} Encryption key
	 */
	async getConversationKey(conversationId) {
		// Check in-memory cache first
		if (this.conversationKeys.has(conversationId)) {
			console.log(`🔐 Using cached key for conversation: ${conversationId}`);
			return this.conversationKeys.get(conversationId);
		}

		// Check localStorage
		const storedKey = this.getStoredKey(conversationId);
		if (storedKey) {
			const key = Base64.decode(storedKey);
			this.conversationKeys.set(conversationId, key);
			console.log(`🔐 Retrieved key from storage for conversation: ${conversationId}`);
			return key;
		}

		// Generate new key
		const key = new Uint8Array(32);
		crypto.getRandomValues(key);
		
		// Store in memory and localStorage
		this.conversationKeys.set(conversationId, key);
		this.storeKey(conversationId, Base64.encode(key));
		
		console.log(`🔐 Generated new key for conversation: ${conversationId}`);
		return key;
	}

	/**
	 * Encrypt a message before sending
	 * @param {string} conversationId - Conversation ID
	 * @param {string} messageText - Plain text message
	 * @returns {Promise<string>} Encrypted message content (JSON string)
	 */
	async encryptMessage(conversationId, messageText) {
		try {
			if (!this.isInitialized) {
				throw new Error('Encryption service not initialized');
			}

			const key = await this.getConversationKey(conversationId);
			const nonce = SecureRandom.generateNonce();
			const plaintext = new TextEncoder().encode(messageText);
			const additionalData = new TextEncoder().encode(conversationId);

			const ciphertext = await ChaCha20Poly1305.encrypt(
				key,
				nonce,
				plaintext,
				additionalData
			);

			// Simple encrypted message structure
			const encryptedMessage = {
				v: 1, // version
				n: Base64.encode(nonce),
				c: Base64.encode(ciphertext)
			};

			const result = JSON.stringify(encryptedMessage);
			console.log(`🔐 ✅ Encrypted message for conversation: ${conversationId}`);
			return result;

		} catch (error) {
			console.error('🔐 ❌ Failed to encrypt message:', error);
			throw error; // Don't fall back to plain text - fail fast
		}
	}

	/**
	 * Decrypt a received message
	 * @param {string} conversationId - Conversation ID
	 * @param {string} encryptedContent - Encrypted message content
	 * @returns {Promise<string>} Decrypted message text
	 */
	async decryptMessage(conversationId, encryptedContent) {
		try {
			if (!this.isInitialized) {
				throw new Error('Encryption service not initialized');
			}

			console.log(`🔐 Decrypting message for conversation: ${conversationId}`);

			// Parse encrypted message
			let messageData;
			try {
				messageData = JSON.parse(encryptedContent);
			} catch (parseError) {
				// If it's not JSON, it might be plain text (legacy)
				console.log(`🔐 Content is not JSON, treating as plain text`);
				return encryptedContent;
			}

			// Check if it's our encrypted format
			if (!messageData.v || !messageData.n || !messageData.c) {
				console.log(`🔐 Content is not encrypted format, returning as is`);
				return encryptedContent;
			}

			const key = await this.getConversationKey(conversationId);
			const nonce = Base64.decode(messageData.n);
			const ciphertext = Base64.decode(messageData.c);
			const additionalData = new TextEncoder().encode(conversationId);

			const plaintext = await ChaCha20Poly1305.decrypt(
				key,
				nonce,
				ciphertext,
				additionalData
			);

			const messageText = new TextDecoder().decode(plaintext);
			console.log(`🔐 ✅ Successfully decrypted message: "${messageText}"`);
			return messageText;

		} catch (error) {
			console.error('🔐 ❌ Failed to decrypt message:', error);
			return '[Encrypted message - decryption failed]';
		}
	}

	/**
	 * Load keys from localStorage into memory
	 * @private
	 */
	async loadKeysFromStorage() {
		try {
			if (typeof window === 'undefined') return;

			const stored = localStorage.getItem(this.storageKey);
			if (!stored) return;

			const keys = JSON.parse(stored);
			for (const [conversationId, keyBase64] of Object.entries(keys)) {
				const key = Base64.decode(keyBase64);
				this.conversationKeys.set(conversationId, key);
			}

			console.log(`🔐 Loaded ${Object.keys(keys).length} keys from storage`);
		} catch (error) {
			console.error('🔐 Failed to load keys from storage:', error);
		}
	}

	/**
	 * Get stored key from localStorage
	 * @param {string} conversationId - Conversation ID
	 * @returns {string|null} Base64 encoded key or null
	 * @private
	 */
	getStoredKey(conversationId) {
		try {
			if (typeof window === 'undefined') return null;

			const stored = localStorage.getItem(this.storageKey);
			if (!stored) return null;

			const keys = JSON.parse(stored);
			return keys[conversationId] || null;
		} catch (error) {
			console.error('🔐 Failed to get stored key:', error);
			return null;
		}
	}

	/**
	 * Store key in localStorage
	 * @param {string} conversationId - Conversation ID
	 * @param {string} keyBase64 - Base64 encoded key
	 * @private
	 */
	storeKey(conversationId, keyBase64) {
		try {
			if (typeof window === 'undefined') return;

			const stored = localStorage.getItem(this.storageKey);
			const keys = stored ? JSON.parse(stored) : {};
			keys[conversationId] = keyBase64;
			localStorage.setItem(this.storageKey, JSON.stringify(keys));
		} catch (error) {
			console.error('🔐 Failed to store key:', error);
		}
	}

	/**
	 * Clear conversation encryption key (for cleanup)
	 * @param {string} conversationId - Conversation ID
	 */
	async clearConversationKey(conversationId) {
		// Clear from memory
		const key = this.conversationKeys.get(conversationId);
		if (key) {
			CryptoUtils.secureClear(key);
			this.conversationKeys.delete(conversationId);
		}

		// Clear from localStorage
		try {
			if (typeof window !== 'undefined') {
				const stored = localStorage.getItem(this.storageKey);
				if (stored) {
					const keys = JSON.parse(stored);
					delete keys[conversationId];
					localStorage.setItem(this.storageKey, JSON.stringify(keys));
				}
			}
		} catch (error) {
			console.error('🔐 Failed to clear stored key:', error);
		}

		console.log(`🔐 Cleared encryption key for conversation: ${conversationId}`);
	}

	/**
	 * Check if encryption is active for a conversation
	 * @param {string} conversationId - Conversation ID
	 * @returns {boolean} Whether encryption is active
	 */
	isEncryptionActive(conversationId) {
		return this.conversationKeys.has(conversationId) || !!this.getStoredKey(conversationId);
	}

	/**
	 * Set encryption key for a conversation (for key sharing)
	 * @param {string} conversationId - Conversation ID
	 * @param {string} keyBase64 - Base64 encoded encryption key
	 */
	async setConversationKey(conversationId, keyBase64) {
		try {
			const key = Base64.decode(keyBase64);
			this.conversationKeys.set(conversationId, key);
			this.storeKey(conversationId, keyBase64);
			console.log(`🔐 Set encryption key for conversation: ${conversationId}`);
		} catch (error) {
			console.error('🔐 Failed to set conversation key:', error);
		}
	}

	/**
	 * Get conversation key as base64 (for key sharing)
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<string|null>} Base64 encoded key or null
	 */
	async getConversationKeyBase64(conversationId) {
		try {
			const key = await this.getConversationKey(conversationId);
			return key ? Base64.encode(key) : null;
		} catch (error) {
			console.error('🔐 Failed to get conversation key:', error);
			return null;
		}
	}

	/**
	 * Clear all stored keys
	 */
	async clearAllKeys() {
		// Clear memory
		for (const key of this.conversationKeys.values()) {
			CryptoUtils.secureClear(key);
		}
		this.conversationKeys.clear();

		// Clear localStorage
		if (typeof window !== 'undefined') {
			localStorage.removeItem(this.storageKey);
		}

		console.log('🔐 Cleared all encryption keys');
	}
}

// Create and export singleton instance
export const clientEncryption = new ClientEncryptionService();