/**
 * @fileoverview Unified post-quantum encryption service for QryptChat
 * This is a compatibility wrapper that provides a simple API while using
 * ML-KEM-1024 post-quantum encryption underneath for all operations
 */

import { postQuantumEncryption } from './post-quantum-encryption.js';
import { Base64 } from './index.js';

/**
 * Client-side post-quantum encryption service
 * This provides a simplified API while using ML-KEM-1024 + ChaCha20-Poly1305 underneath
 * All encryption is post-quantum resistant using the same system as the main app
 */
export class ClientEncryptionService {
	constructor() {
		this.conversationKeys = new Map(); // conversationId -> { publicKey, privateKey }
		this.isInitialized = false;
	}

	/**
	 * Initialize the encryption service
	 */
	async initialize() {
		await postQuantumEncryption.initialize();
		this.isInitialized = true;
		console.log('🔐 Client encryption service initialized (ML-KEM-1024 + ChaCha20-Poly1305)');
	}

	/**
	 * Get or generate a key pair for a conversation
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<{publicKey: string, privateKey: string}>} Key pair for conversation
	 */
	async getConversationKey(conversationId) {
		if (!this.conversationKeys.has(conversationId)) {
			// Generate new ML-KEM key pair for this conversation
			const keyPair = await postQuantumEncryption.kemAlgorithm.generateKeyPair();
			const keys = {
				publicKey: Base64.encode(keyPair[0]),
				privateKey: Base64.encode(keyPair[1])
			};
			this.conversationKeys.set(conversationId, keys);
			console.log(`🔐 Generated new ML-KEM key pair for conversation: ${conversationId}`);
		}
		return this.conversationKeys.get(conversationId);
	}

	/**
	 * Encrypt message for a conversation using post-quantum encryption
	 * @param {string} conversationId - Conversation ID
	 * @param {string} message - Plain text message
	 * @returns {Promise<string>} Encrypted message (JSON string)
	 */
	async encryptMessage(conversationId, message) {
		try {
			if (!this.isInitialized) {
				await this.initialize();
			}

			console.log(`🔐 [CLIENT-PQ] Encrypting message for conversation: ${conversationId}`);

			// Get conversation key pair
			const keys = await this.getConversationKey(conversationId);

			// Use post-quantum encryption with the conversation's public key
			const encryptedContent = await postQuantumEncryption.encryptForRecipient(message, keys.publicKey);

			console.log(`🔐 [CLIENT-PQ] ✅ Encrypted message using ML-KEM-1024 for conversation: ${conversationId}`);
			return encryptedContent;

		} catch (error) {
			console.error(`🔐 [CLIENT-PQ] ❌ Failed to encrypt message:`, error);
			throw error;
		}
	}

	/**
	 * Decrypt message for a conversation using post-quantum encryption
	 * @param {string} conversationId - Conversation ID
	 * @param {string} encryptedContent - Encrypted message content (JSON string)
	 * @returns {Promise<string>} Decrypted message text
	 */
	async decryptMessage(conversationId, encryptedContent) {
		try {
			if (!this.isInitialized) {
				await this.initialize();
			}

			console.log(`🔐 [CLIENT-PQ] Decrypting message for conversation: ${conversationId}`);

			// Try to parse as JSON first
			let messageData;
			try {
				messageData = JSON.parse(encryptedContent);
			} catch (parseError) {
				// If not JSON, assume it's plain text (legacy support)
				console.log(`🔐 [CLIENT-PQ] Content is not JSON, treating as plain text`);
				return encryptedContent;
			}

			// Check if it's post-quantum encrypted format (version 3)
			if (messageData.v === 3 && (messageData.alg === 'ML-KEM-1024' || messageData.alg === 'ML-KEM-768')) {
				// Get conversation key pair
				const keys = await this.getConversationKey(conversationId);
				
				// Temporarily set the conversation's private key for decryption
				const originalKeys = postQuantumEncryption.userKeys;
				postQuantumEncryption.userKeys = {
					publicKey: keys.publicKey,
					privateKey: keys.privateKey
				};

				try {
					// Use post-quantum decryption
					const decryptedContent = await postQuantumEncryption.decryptFromSender(encryptedContent, '');
					console.log(`🔐 [CLIENT-PQ] ✅ Successfully decrypted message using ML-KEM-1024: "${decryptedContent}"`);
					return decryptedContent;
				} finally {
					// Restore original keys
					postQuantumEncryption.userKeys = originalKeys;
				}
			}

			// Check if it's legacy format (version 1) - convert to post-quantum
			if (messageData.v === 1) {
				console.log(`🔐 [CLIENT-PQ] Legacy format detected, treating as plain text for now`);
				return '[Legacy encrypted message - please re-encrypt with post-quantum encryption]';
			}

			// If not recognized format, treat as plain text
			console.log(`🔐 [CLIENT-PQ] Unknown format, treating as plain text`);
			return encryptedContent;

		} catch (error) {
			console.error(`🔐 [CLIENT-PQ] ❌ Failed to decrypt message:`, error);
			return '[Encrypted message - decryption failed]';
		}
	}

	/**
	 * Clear all conversation keys
	 */
	async clearAllKeys() {
		this.conversationKeys.clear();
		console.log(`🔐 [CLIENT-PQ] Cleared all conversation keys`);
	}

	/**
	 * Check if service is ready
	 * @returns {boolean} Whether service is initialized
	 */
	isReady() {
		return this.isInitialized;
	}
}

// Create and export singleton instance
export const clientEncryption = new ClientEncryptionService();