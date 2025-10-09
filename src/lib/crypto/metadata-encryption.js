/**
 * @fileoverview Metadata encryption service for QryptChat
 * Encrypts file metadata using multi-recipient post-quantum encryption
 * Ensures metadata is encrypted E2E just like message content
 */

import { multiRecipientEncryption } from './multi-recipient-encryption.js';

/**
 * Metadata encryption service
 * Handles encrypting/decrypting file metadata for conversation participants
 */
export class MetadataEncryptionService {
	constructor() {
		this.isInitialized = false;
	}

	/**
	 * Initialize the service
	 */
	async initialize() {
		if (!this.isInitialized) {
			await multiRecipientEncryption.initialize();
			this.isInitialized = true;
			console.log('🔐 [METADATA] Metadata encryption service initialized');
		}
	}

	/**
	 * Encrypt metadata for all conversation participants
	 * @param {string} conversationId - Conversation ID
	 * @param {Object} metadata - Plain metadata object
	 * @returns {Promise<Object>} Encrypted metadata for each participant
	 */
	async encryptMetadata(conversationId, metadata) {
		try {
			if (!this.isInitialized) {
				await this.initialize();
			}

			console.log(`🔐 [METADATA] Encrypting metadata for conversation: ${conversationId}`);
			
			// Convert metadata to JSON string
			const metadataString = JSON.stringify(metadata);
			
			// Encrypt for all conversation participants using multi-recipient encryption
			const encryptedMetadata = await multiRecipientEncryption.encryptForConversation(
				conversationId,
				metadataString
			);
			
			console.log(`🔐 [METADATA] ✅ Successfully encrypted metadata for ${Object.keys(encryptedMetadata).length} participants`);
			return encryptedMetadata;

		} catch (error) {
			console.error('🔐 [METADATA] ❌ Failed to encrypt metadata:', error);
			throw error;
		}
	}

	/**
	 * Decrypt metadata for current user
	 * @param {string} encryptedMetadata - Encrypted metadata for current user
	 * @param {string} senderPublicKey - Sender's public key (for verification)
	 * @returns {Promise<Object>} Decrypted metadata object
	 */
	async decryptMetadata(encryptedMetadata, senderPublicKey) {
		try {
			if (!this.isInitialized) {
				await this.initialize();
			}

			console.log('🔐 [METADATA] Decrypting metadata for current user');
			
			// Decrypt the metadata string
			const metadataString = await multiRecipientEncryption.decryptForCurrentUser(
				encryptedMetadata,
				senderPublicKey
			);
			
			// Parse back to object
			const metadata = JSON.parse(metadataString);
			
			console.log('🔐 [METADATA] ✅ Successfully decrypted metadata');
			return metadata;

		} catch (error) {
			console.error('🔐 [METADATA] ❌ Failed to decrypt metadata:', error);
			throw error;
		}
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
export const metadataEncryption = new MetadataEncryptionService();