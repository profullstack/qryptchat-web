/**
 * @fileoverview Multi-recipient post-quantum encryption service for QryptChat
 * Encrypts messages for multiple recipients using their individual ML-KEM-768 public keys
 * Each recipient gets their own encrypted copy that only they can decrypt
 * Uses only post-quantum encryption methods - no legacy encryption
 */

import { postQuantumEncryption } from './post-quantum-encryption.js';
import { publicKeyService } from './public-key-service.js';

/**
 * Multi-recipient post-quantum encryption service
 * Handles encrypting messages for all conversation participants using ML-KEM-768
 */
export class MultiRecipientEncryptionService {
	constructor() {
		this.isInitialized = false;
	}

	/**
	 * Initialize the service
	 */
	async initialize() {
		if (!this.isInitialized) {
			await postQuantumEncryption.initialize();
			await publicKeyService.initialize();
			this.isInitialized = true;
			console.log('🔐 Multi-recipient post-quantum encryption service initialized (ML-KEM-768)');
		}
	}

	/**
	 * Encrypt message for all conversation participants
	 * @param {string} conversationId - Conversation ID
	 * @param {string} messageContent - Plain text message content
	 * @returns {Promise<Object>} Object with encrypted content for each participant
	 */
	async encryptForConversation(conversationId, messageContent) {
		try {
			if (!this.isInitialized) {
				await this.initialize();
			}

			console.log(`🔐 [MULTI] Encrypting message for conversation: ${conversationId}`);

			// Get all participant public keys for this conversation
			const participantKeys = await publicKeyService.getConversationParticipantKeys(conversationId);
			
			if (participantKeys.size === 0) {
				console.warn(`🔐 [MULTI] No participant keys found for conversation ${conversationId}`);
				throw new Error('No participant keys found for conversation');
			}

			console.log(`🔐 [MULTI] Found ${participantKeys.size} participants to encrypt for`);

			// Encrypt the message for each participant
			const encryptedContents = Object.create(null);
			
			for (const [userId, publicKey] of participantKeys.entries()) {
				try {
					console.log(`🔐 [MULTI] Encrypting for participant: ${userId}`);
					
					const encryptedContent = await postQuantumEncryption.encryptForRecipient(
						messageContent,
						publicKey
					);
					
					encryptedContents[userId] = encryptedContent;
					console.log(`🔐 [MULTI] ✅ Encrypted for participant: ${userId}`);
					
				} catch (error) {
					console.error(`🔐 [MULTI] ❌ Failed to encrypt for participant ${userId}:`, error);
					// Continue with other participants - don't fail the entire operation
				}
			}

			if (Object.keys(encryptedContents).length === 0) {
				throw new Error('Failed to encrypt message for any participants');
			}

			console.log(`🔐 [MULTI] ✅ Successfully encrypted message for ${Object.keys(encryptedContents).length} participants`);
			return encryptedContents;

		} catch (error) {
			console.error('🔐 [MULTI] ❌ Failed to encrypt message for conversation:', error);
			throw error;
		}
	}

	/**
	 * Decrypt message for current user
	 * @param {string} encryptedContent - Encrypted content for current user
	 * @param {string} senderPublicKey - Sender's public key (for verification)
	 * @returns {Promise<string>} Decrypted message content
	 */
	async decryptForCurrentUser(encryptedContent, senderPublicKey) {
		try {
			if (!this.isInitialized) {
				await this.initialize();
			}

			console.log('🔐 [MULTI] Decrypting message for current user');

			const decryptedContent = await postQuantumEncryption.decryptFromSender(
				encryptedContent,
				senderPublicKey
			);

			console.log(`🔐 [MULTI] ✅ Successfully decrypted message: "${decryptedContent}"`);
			return decryptedContent;

		} catch (error) {
			console.error('🔐 [MULTI] ❌ Failed to decrypt message:', error);
			throw error;
		}
	}

	/**
	 * Encrypt message for specific recipients (for direct messages or custom groups)
	 * @param {string} messageContent - Plain text message content
	 * @param {Array<string>} recipientUserIds - Array of recipient user IDs
	 * @returns {Promise<Object>} Object with encrypted content for each recipient
	 */
	async encryptForRecipients(messageContent, recipientUserIds) {
		try {
			if (!this.isInitialized) {
				await this.initialize();
			}

			console.log(`🔐 [MULTI] Encrypting message for ${recipientUserIds.length} specific recipients`);

			const encryptedContents = Object.create(null);

			for (const userId of recipientUserIds) {
				try {
					// Get public key for this user
					const publicKey = await publicKeyService.getUserPublicKey(userId);
					
					if (!publicKey) {
						console.warn(`🔐 [MULTI] No public key found for user: ${userId}`);
						continue;
					}

					console.log(`🔐 [MULTI] Encrypting for recipient: ${userId}`);
					
					const encryptedContent = await postQuantumEncryption.encryptForRecipient(
						messageContent,
						publicKey
					);
					
					encryptedContents[userId] = encryptedContent;
					console.log(`🔐 [MULTI] ✅ Encrypted for recipient: ${userId}`);
					
				} catch (error) {
					console.error(`🔐 [MULTI] ❌ Failed to encrypt for recipient ${userId}:`, error);
					// Continue with other recipients
				}
			}

			if (Object.keys(encryptedContents).length === 0) {
				throw new Error('Failed to encrypt message for any recipients');
			}

			console.log(`🔐 [MULTI] ✅ Successfully encrypted message for ${Object.keys(encryptedContents).length} recipients`);
			return encryptedContents;

		} catch (error) {
			console.error('🔐 [MULTI] ❌ Failed to encrypt message for recipients:', error);
			throw error;
		}
	}

	/**
	 * Get user's own public key (for self-encryption in some cases)
	 * @returns {Promise<string>} User's public key
	 */
	async getUserPublicKey() {
		if (!this.isInitialized) {
			await this.initialize();
		}
		return await postQuantumEncryption.getPublicKey();
	}

	/**
	 * Check if service is ready for encryption
	 * @returns {boolean} Whether service is initialized
	 */
	isReady() {
		return this.isInitialized;
	}
}

// Create and export singleton instance
export const multiRecipientEncryption = new MultiRecipientEncryptionService();