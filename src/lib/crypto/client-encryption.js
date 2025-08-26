/**
 * @fileoverview Client-side encryption service for QryptChat
 * Handles end-to-end encryption/decryption on the client side
 */

import { ChaCha20Poly1305, SecureRandom, Base64, CryptoUtils } from './index.js';
import { keyManager } from './key-manager.js';

/**
 * Simple client-side encryption service
 * For now, uses basic ChaCha20-Poly1305 encryption with conversation-specific keys
 */
export class ClientEncryptionService {
	constructor() {
		this.conversationKeys = new Map(); // conversationId -> encryption key
		this.isInitialized = false;
	}

	/**
	 * Initialize the encryption service
	 */
	async initialize() {
		await keyManager.initialize();
		this.isInitialized = true;
		console.log('🔐 Client encryption service initialized');
	}

	/**
	 * Generate or retrieve encryption key for a conversation
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<Uint8Array>} Encryption key
	 */
	async getConversationKey(conversationId) {
		// First check in-memory cache
		if (this.conversationKeys.has(conversationId)) {
			const cachedKey = this.conversationKeys.get(conversationId);
			console.log(`🔐 [KEY] Using cached key for conversation: ${conversationId}`);
			return cachedKey;
		}

		// Then check key manager persistent storage
		let key = await keyManager.getConversationKey(conversationId);
		
		if (key) {
			console.log(`🔐 [KEY] Retrieved existing key from storage for conversation: ${conversationId}`);
			// Cache in memory for faster access
			this.conversationKeys.set(conversationId, key);
			return key;
		}

		// Only generate a new key if none exists anywhere
		console.log(`🔐 [KEY] No existing key found, generating new key for conversation: ${conversationId}`);
		key = await keyManager.generateConversationKey(conversationId);
		
		// Cache in memory for faster access
		this.conversationKeys.set(conversationId, key);
		console.log(`🔐 [KEY] Generated and cached new key for conversation: ${conversationId}`);
		return key;
	}

	/**
	 * Encrypt a message before sending
	 * @param {string} conversationId - Conversation ID
	 * @param {string} messageText - Plain text message
	 * @returns {Promise<string>} Encrypted message content
	 */
	async encryptMessage(conversationId, messageText) {
		try {
			if (!this.isInitialized) {
				console.warn('🔐 Encryption service not initialized, sending plain text');
				return messageText;
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

			// Create encrypted message structure
			const encryptedMessage = {
				type: 'encrypted',
				nonce: Base64.encode(nonce),
				ciphertext: Base64.encode(ciphertext),
				version: '1.0'
			};

			const encryptedContent = JSON.stringify(encryptedMessage);
			console.log(`🔐 Encrypted message for conversation: ${conversationId}`);
			return encryptedContent;

		} catch (error) {
			console.error('🔐 Failed to encrypt message:', error);
			// Fall back to plain text to avoid breaking the app
			return messageText;
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
				return encryptedContent;
			}

			console.log(`🔐 [DECRYPT] Raw encrypted content:`, encryptedContent.substring(0, 200) + '...');

			// Check if the content is hex-encoded (starts with \x or is pure hex)
			let jsonContent = encryptedContent;
			if (encryptedContent.startsWith('\\x') || /^[0-9a-fA-F]+$/.test(encryptedContent)) {
				console.log(`🔐 [DECRYPT] Content appears to be hex-encoded, decoding...`);
				try {
					let hexString = encryptedContent;
					
					// Handle \x prefixed hex strings
					if (encryptedContent.startsWith('\\x')) {
						// Remove \x prefix and convert to plain hex
						hexString = encryptedContent.replace(/\\x/g, '');
						console.log(`🔐 [DECRYPT] Cleaned hex string:`, hexString.substring(0, 100) + '...');
					}
					
					// Convert hex to bytes, then to string
					const hexMatches = hexString.match(/.{1,2}/g);
					if (!hexMatches) {
						console.error(`🔐 [DECRYPT] Invalid hex format`);
						return '[Encrypted message - invalid hex format]';
					}
					const bytes = new Uint8Array(hexMatches.map(byte => parseInt(byte, 16)));
					jsonContent = new TextDecoder().decode(bytes);
					console.log(`🔐 [DECRYPT] Hex-decoded content:`, jsonContent.substring(0, 200) + '...');
				} catch (hexError) {
					console.error(`🔐 [DECRYPT] Failed to decode hex:`, hexError);
					return '[Encrypted message - hex decode failed]';
				}
			}

			// Check if the content is encrypted JSON
			let messageData;
			try {
				messageData = JSON.parse(jsonContent);
			} catch (parseError) {
				const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
				console.log(`🔐 [DECRYPT] Not JSON, assuming plain text:`, errorMessage);
				return jsonContent;
			}

			if (messageData.type !== 'encrypted') {
				console.log(`🔐 [DECRYPT] Not encrypted type, returning as is`);
				return jsonContent;
			}

			console.log(`🔐 [DECRYPT] Decrypting encrypted message with nonce:`, messageData.nonce);

			const key = await this.getConversationKey(conversationId);
			const nonce = Base64.decode(messageData.nonce);
			const ciphertext = Base64.decode(messageData.ciphertext);
			const additionalData = new TextEncoder().encode(conversationId);

			const plaintext = await ChaCha20Poly1305.decrypt(
				key,
				nonce,
				ciphertext,
				additionalData
			);

			const messageText = new TextDecoder().decode(plaintext);
			console.log(`🔐 [DECRYPT] ✅ Successfully decrypted message: "${messageText}"`);
			return messageText;

		} catch (error) {
			console.error('🔐 [DECRYPT] ❌ Failed to decrypt message:', error);
			return '[Encrypted message - decryption failed]';
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

		// Clear from persistent storage
		await keyManager.removeConversationKey(conversationId);
		console.log(`🔐 Cleared encryption key for conversation: ${conversationId}`);
	}

	/**
	 * Check if encryption is active for a conversation
	 * @param {string} conversationId - Conversation ID
	 * @returns {boolean} Whether encryption is active
	 */
	isEncryptionActive(conversationId) {
		return this.conversationKeys.has(conversationId) || keyManager.hasConversationKey(conversationId);
	}

	/**
	 * Set encryption key for a conversation (for key sharing)
	 * @param {string} conversationId - Conversation ID
	 * @param {string} keyBase64 - Base64 encoded encryption key
	 */
	async setConversationKey(conversationId, keyBase64) {
		try {
			await keyManager.importConversationKey(conversationId, keyBase64);
			const key = Base64.decode(keyBase64);
			this.conversationKeys.set(conversationId, key);
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
			return await keyManager.exportConversationKey(conversationId);
		} catch (error) {
			console.error('🔐 Failed to get conversation key:', error);
			return null;
		}
	}
}

// Create and export singleton instance
export const clientEncryption = new ClientEncryptionService();