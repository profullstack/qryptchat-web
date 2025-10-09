/**
 * @fileoverview Multi-recipient post-quantum encryption service for QryptChat
 * Encrypts messages for multiple recipients using their individual ML-KEM-1024 public keys
 * Each recipient gets their own encrypted copy that only they can decrypt
 * Uses only post-quantum encryption methods - no legacy encryption
 */

import { Base64 } from './index.js';
// Regular import with JSDoc comments to help TypeScript
// @ts-ignore
import { postQuantumEncryption } from './post-quantum-encryption.js';
import { publicKeyService } from './public-key-service.js';

/**
 * Multi-recipient post-quantum encryption service
 * Handles encrypting messages for all conversation participants using ML-KEM-1024
 */
export class MultiRecipientEncryptionService {
	constructor() {
		this.isInitialized = false;
		this.successfulEncryptionCount = 0;
		this.failedEncryptionCount = 0;
		this.encryptionErrors = []; // Array to collect detailed error information
	}

	/**
	 * Initialize the service
	 */
	async initialize() {
		if (!this.isInitialized) {
			await postQuantumEncryption.initialize();
			await publicKeyService.initialize();
			this.isInitialized = true;
			console.log('🔐 Multi-recipient post-quantum encryption service initialized (ML-KEM-1024)');
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

			// Reset error collection for this encryption attempt
			this.encryptionErrors = [];
			
			console.log(`🔐 [MULTI] Encrypting message for conversation: ${conversationId}`);
			console.log(`🔐 [MULTI] Message content:`, {
				type: typeof messageContent,
				length: messageContent?.length || 0,
				preview: messageContent?.substring(0, 50) || 'N/A'
			});

			// Get all participant public keys for this conversation
			console.log(`🔐 [MULTI] Getting participant keys for conversation: ${conversationId}`);
			const participantKeys = await publicKeyService.getConversationParticipantKeys(conversationId);
			
			console.log(`🔐 [MULTI] Participant keys result:`, {
				type: typeof participantKeys,
				isMap: participantKeys instanceof Map,
				size: participantKeys?.size || 0,
				keys: participantKeys instanceof Map ? Array.from(participantKeys.keys()) : 'Not a Map'
			});
			
			if (participantKeys.size === 0) {
				console.warn(`🔐 [MULTI] No participant keys found for conversation ${conversationId}`);
				throw new Error('No participant keys found for conversation');
			}

			console.log(`🔐 [MULTI] Found ${participantKeys.size} participants to encrypt for`);

			// Encrypt the message for each participant
			const encryptedContents = Object.create(null);
			this.successfulEncryptionCount = 0;
			this.failedEncryptionCount = 0;
			let kyberHeaderErrorDetected = false;
			
			for (const [userId, publicKey] of participantKeys.entries()) {
				try {
					console.log(`🔐 [MULTI] Encrypting for participant: ${userId}`);
					
					// Debug the raw key we're receiving
					console.log(`🔐 [MULTI] Public key format for ${userId}:`, {
						type: typeof publicKey,
						length: publicKey?.length || 0,
						firstChars: publicKey?.substring(0, 20) || 'N/A'
					});
					
					// Check for KYBER header in the first few characters (Base64 encoded)
					if (publicKey && publicKey.startsWith('S1lCRVIxMDI')) {
						console.error(`🔐 [MULTI] Detected KYBER header in key for ${userId} - this format is not compatible`);
						kyberHeaderErrorDetected = true;
						this.encryptionErrors.push({
							userId,
							errorType: 'KYBER_HEADER',
							message: 'Key has KYBER header format that cannot be used with ML-KEM'
						});
						// Skip encryption for this user - they need to reset their keys
						continue;
					}
					
					// Only use ML-KEM encryption - no AES fallbacks
					const encryptedContent = await postQuantumEncryption.encryptForRecipient(
						messageContent,
						publicKey
					);
					
					encryptedContents[userId] = encryptedContent;
					this.successfulEncryptionCount++;
					console.log(`🔐 [MULTI] ✅ Encrypted for participant: ${userId} using ML-KEM`);
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					this.failedEncryptionCount++;
					
					// Collect detailed error information
					const errorInfo = {
						userId,
						errorType: 'UNKNOWN',
						message: errorMessage,
					};
					
					// Check for specific error types
					if (errorMessage.includes('invalid encapsulation key')) {
						errorInfo.errorType = 'INVALID_KEY';
						console.error(`🔐 [MULTI] ❌ Invalid encapsulation key detected for user ${userId}`);
					} else if (errorMessage.includes('KYBER')) {
						errorInfo.errorType = 'KYBER_HEADER';
						kyberHeaderErrorDetected = true;
					}
					
					this.encryptionErrors.push(errorInfo);
					console.error(`🔐 [MULTI] ❌ Failed to validate or encrypt for participant ${userId}:`, error);
					// Continue with other participants - don't fail the entire operation
				}
			}

			if (Object.keys(encryptedContents).length === 0) {
				// Check if we detected KYBER header issues
				if (kyberHeaderErrorDetected || this.encryptionErrors.some(e => e.errorType === 'KYBER_HEADER')) {
					const kyberUsers = this.encryptionErrors
						.filter(e => e.errorType === 'KYBER_HEADER')
						.map(e => e.userId)
						.join(', ');
					throw new Error(`Encryption failed: Users with incompatible keys detected (${kyberUsers}). All participants must use the Nuclear Key Reset option in Settings to generate new encryption keys.`);
				}
				
				// Check if we had invalid keys
				if (this.encryptionErrors.some(e => e.errorType === 'INVALID_KEY')) {
					throw new Error('Failed to encrypt message: Invalid encryption keys. Both participants must reset their keys in Settings.');
				}
				
				throw new Error('Failed to encrypt message for any participants');
			}

			// Check if we have some successful encryptions but also some KYBER header issues
			if (Object.keys(encryptedContents).length > 0 && kyberHeaderErrorDetected) {
				const kyberUsers = this.encryptionErrors
					.filter(e => e.errorType === 'KYBER_HEADER')
					.map(e => e.userId)
					.join(', ');
				console.warn(`🔐 [MULTI] ⚠️ Partial encryption success: ${Object.keys(encryptedContents).length} users encrypted, but ${kyberUsers} have incompatible keys and need Nuclear Key Reset`);
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
			
			try {
				// First try to parse the message to see if it's JSON
				let messageData;
				let decryptedContent = '';
				
				try {
					messageData = JSON.parse(encryptedContent);
				} catch (parseError) {
					console.log('🔐 [MULTI] Message is not in JSON format, trying standard decryption');
					// Not JSON, try standard decryption
					
					// Using function call to avoid TypeScript error
					try {
						// @ts-ignore - Ignore TypeScript validation for this line
						decryptedContent = await postQuantumEncryption.decryptFromSender(
							encryptedContent,
							senderPublicKey
						);
						console.log(`🔐 [MULTI] ✅ Successfully decrypted message: "${decryptedContent}"`);
						return decryptedContent;
					} catch (decryptError) {
						console.error('🔐 [MULTI] Standard decryption failed:', decryptError);
						throw new Error('Failed to decrypt message');
					}
				}
				
				// No AES fallback support - only post-quantum encryption
				
				// Otherwise use standard ML-KEM decryption
				try {
					// @ts-ignore - Ignore TypeScript validation for this line
					decryptedContent = await postQuantumEncryption.decryptFromSender(
						encryptedContent,
						senderPublicKey
					);
					
					console.log(`🔐 [MULTI] ✅ Successfully decrypted message: "${decryptedContent}"`);
					return decryptedContent;
				} catch (decryptError) {
					console.error('🔐 [MULTI] ML-KEM decryption failed:', decryptError);
					throw new Error('Failed to decrypt message');
				}
			} catch (error) {
				console.error('🔐 [MULTI] ❌ All decryption methods failed:', error);
				throw error;
			}

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
						console.error(`🔐 [MULTI] ❌ No public key found for user: ${userId} - skipping encryption`);
						this.failedEncryptionCount++;
						continue;
					}

					console.log(`🔐 [MULTI] Encrypting for recipient: ${userId}`);
					
					// Debug the raw key we're receiving
					console.log(`🔐 [MULTI] Public key format for ${userId}:`, {
						type: typeof publicKey,
						length: publicKey?.length || 0,
						firstChars: publicKey?.substring(0, 20) || 'N/A'
					});
					
					// Only use ML-KEM encryption - no AES fallbacks
					const encryptedContent = await postQuantumEncryption.encryptForRecipient(
						messageContent,
						publicKey
					);
					
					encryptedContents[userId] = encryptedContent;
					console.log(`🔐 [MULTI] ✅ Encrypted for recipient: ${userId} using ML-KEM`);
				} catch (error) {
					console.error(`🔐 [MULTI] ❌ Failed to validate or encrypt for recipient ${userId}:`, error);
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
	
	/**
	 * Simple AES-GCM fallback encryption when ML-KEM fails
	 * @param {string} message - Plain text message to encrypt
	 * @param {string} userId - User ID to encrypt for (used as salt)
	 * @returns {Promise<string>} - Encrypted message
	 */
	async fallbackEncrypt(message, userId) {
		try {
			console.log(`🔐 [FALLBACK] Using AES-GCM encryption for user ${userId}`);
			
			// Generate a random key for AES-GCM
			const keyBytes = new Uint8Array(32); // 256-bit key
			crypto.getRandomValues(keyBytes);
			
			// Use the user ID as part of the IV for uniqueness
			const ivInput = new TextEncoder().encode(userId + Date.now());
			const ivHash = await crypto.subtle.digest('SHA-256', ivInput);
			const iv = new Uint8Array(ivHash).slice(0, 12); // Use first 12 bytes for IV
			
			// Import the random key
			const key = await crypto.subtle.importKey(
				'raw',
				keyBytes,
				{ name: 'AES-GCM', length: 256 },
				false,
				['encrypt']
			);
			
			// Encrypt the message
			const plaintext = new TextEncoder().encode(message);
			const encryptedData = await crypto.subtle.encrypt(
				{ name: 'AES-GCM', iv },
				key,
				plaintext
			);
			
			// Create a structure compatible with our existing format
			const encryptedMessage = {
				v: 3,
				alg: 'FALLBACK-AES',
				key: Base64.encode(keyBytes),
				iv: Base64.encode(iv),
				c: Base64.encode(new Uint8Array(encryptedData)),
				t: Date.now()
			};
			
			return JSON.stringify(encryptedMessage);
		} catch (error) {
			console.error(`🔐 [FALLBACK] ❌ Fallback encryption failed:`, error);
			throw new Error('All encryption methods failed');
		}
	}
	
	/**
	 * Decrypt message that was encrypted with fallback method
	 * @param {Object} messageData - Parsed message data
	 * @returns {Promise<string>} - Decrypted message
	 */
	async fallbackDecrypt(messageData) {
		try {
			console.log(`🔐 [FALLBACK] Decrypting fallback message`);
			
			// Use defensive programming to handle potentially missing properties
			if (!messageData || typeof messageData !== 'object') {
				console.error('🔐 [FALLBACK] Invalid message data:', messageData);
				return '[Fallback decryption failed - invalid data]';
			}
			
			// Check if required properties exist
			if (!('key' in messageData) || !('iv' in messageData) || !('c' in messageData)) {
				console.error('🔐 [FALLBACK] Missing required fields in message data');
				return '[Fallback decryption failed - missing data]';
			}
			
			// Extract necessary fields
			const keyBase64 = String(messageData.key || '');
			const ivBase64 = String(messageData.iv || '');
			const ciphertextBase64 = String(messageData.c || '');
			
			// Validate the extracted data
			if (!keyBase64 || !ivBase64 || !ciphertextBase64) {
				console.error('🔐 [FALLBACK] Empty required fields in message data');
				return '[Fallback decryption failed - empty data]';
			}
			
			// Decode from base64
			const keyBytes = Base64.decode(keyBase64);
			const iv = Base64.decode(ivBase64);
			const ciphertext = Base64.decode(ciphertextBase64);
			
			// Import the key
			const key = await crypto.subtle.importKey(
				'raw',
				keyBytes,
				{ name: 'AES-GCM', length: 256 },
				false,
				['decrypt']
			);
			
			// Decrypt
			const decryptedData = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv },
				key,
				ciphertext
			);
			
			// Convert to text
			const decryptedText = new TextDecoder().decode(new Uint8Array(decryptedData));
			return decryptedText;
		} catch (error) {
			console.error(`🔐 [FALLBACK] ❌ Fallback decryption failed:`, error);
			return '[Message encrypted with fallback method - decryption failed]';
		}
	}
}

// Create and export singleton instance
export const multiRecipientEncryption = new MultiRecipientEncryptionService();