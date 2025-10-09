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
	 * @param {Object} supabase - Supabase client for database queries
	 * @returns {Promise<Object>} Encrypted metadata for each participant
	 */
	async encryptMetadata(conversationId, metadata, supabase) {
		try {
			if (!this.isInitialized) {
				await this.initialize();
			}

			console.log(`🔐 [METADATA] Encrypting metadata for conversation: ${conversationId}`);
			
			// Get participant public keys directly from database
			const { data: participants, error: participantsError } = await supabase
				.from('conversation_participants')
				.select(`
					user_id,
					users!inner(
						id,
						public_key
					)
				`)
				.eq('conversation_id', conversationId);

			if (participantsError || !participants || participants.length === 0) {
				console.error('🔐 [METADATA] Failed to get participants:', participantsError);
				throw new Error('No participants found for conversation');
			}

			console.log(`🔐 [METADATA] Found ${participants.length} participants`);
			
			// Convert metadata to JSON string
			const metadataString = JSON.stringify(metadata);
			
			// Encrypt for each participant
			const encryptedMetadata = {};
			
			for (const participant of participants) {
				const userId = participant.user_id;
				const publicKey = participant.users.public_key;
				
				if (!publicKey) {
					console.warn(`🔐 [METADATA] No public key for user ${userId}, skipping`);
					continue;
				}
				
				try {
					// Use post-quantum encryption directly
					const { postQuantumEncryption } = await import('./post-quantum-encryption.js');
					await postQuantumEncryption.initialize();
					
					const encrypted = await postQuantumEncryption.encryptForRecipient(
						metadataString,
						publicKey
					);
					
					encryptedMetadata[userId] = encrypted;
					console.log(`🔐 [METADATA] ✅ Encrypted for user ${userId}`);
				} catch (encryptError) {
					console.error(`🔐 [METADATA] Failed to encrypt for user ${userId}:`, encryptError);
					// Continue with other participants
				}
			}
			
			if (Object.keys(encryptedMetadata).length === 0) {
				throw new Error('Failed to encrypt metadata for any participants');
			}
			
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