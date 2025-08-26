/**
 * @fileoverview Key Distribution Service for QryptChat
 * Handles secure sharing of conversation keys between participants
 */

import { Base64, ChaCha20Poly1305, SecureRandom } from './index.js';
import { keyManager } from './key-manager.js';
import { clientEncryption } from './client-encryption.js';

/**
 * Key Distribution Service
 * Manages secure sharing of conversation keys between participants
 */
export class KeyDistributionService {
	constructor() {
		this.userPublicKeys = new Map(); // userId -> publicKey (for future RSA/ECDH)
		this.pendingKeyRequests = new Map(); // requestId -> { conversationId, userId, resolve, reject }
	}

	/**
	 * Initialize the key distribution service
	 */
	async initialize() {
		console.log('🔑 Key distribution service initialized');
	}

	/**
	 * Share a conversation key with specific participants
	 * @param {string} conversationId - Conversation ID
	 * @param {string[]} participantIds - Array of participant user IDs
	 * @param {Object} wsChat - WebSocket chat store for sending messages
	 * @returns {Promise<boolean>} Success status
	 */
	async shareConversationKey(conversationId, participantIds, wsChat) {
		try {
			// Get or generate the conversation key
			const conversationKey = await clientEncryption.getConversationKey(conversationId);
			const keyBase64 = Base64.encode(conversationKey);

			console.log(`🔑 Sharing conversation key for ${conversationId} with ${participantIds.length} participants`);

			// For now, we'll use a simple approach: send the key directly
			// In production, this would use public key encryption
			const keyShareMessage = {
				type: 'key_share',
				conversationId,
				key: keyBase64,
				timestamp: Date.now()
			};

			// Send key share message to each participant
			const sharePromises = participantIds.map(async (participantId) => {
				try {
					// Create a special key-sharing message
					const keyMessage = {
						...keyShareMessage,
						recipientId: participantId
					};

					// For now, broadcast the key share message
					// In production, this would be encrypted per recipient
					await this.sendKeyShareMessage(keyMessage, wsChat);
					
					console.log(`🔑 Shared key with participant: ${participantId}`);
					return true;
				} catch (error) {
					console.error(`🔑 Failed to share key with participant ${participantId}:`, error);
					return false;
				}
			});

			const results = await Promise.all(sharePromises);
			const successCount = results.filter(Boolean).length;
			
			console.log(`🔑 Key sharing complete: ${successCount}/${participantIds.length} successful`);
			return successCount === participantIds.length;

		} catch (error) {
			console.error('🔑 Failed to share conversation key:', error);
			return false;
		}
	}

	/**
	 * Handle receiving a key share message
	 * @param {Object} keyShareMessage - Key share message
	 * @returns {Promise<boolean>} Success status
	 */
	async handleKeyShareMessage(keyShareMessage) {
		try {
			const { conversationId, key, recipientId } = keyShareMessage;

			// Verify this key share is for us (in a real system, we'd check recipient)
			console.log(`🔑 Received key share for conversation: ${conversationId}`);

			// Import the shared key
			await keyManager.importConversationKey(conversationId, key);
			
			// Also cache it in the encryption service
			await clientEncryption.setConversationKey(conversationId, key);

			console.log(`🔑 Successfully imported shared key for conversation: ${conversationId}`);
			return true;

		} catch (error) {
			console.error('🔑 Failed to handle key share message:', error);
			return false;
		}
	}

	/**
	 * Request a conversation key from other participants
	 * @param {string} conversationId - Conversation ID
	 * @param {Object} wsChat - WebSocket chat store
	 * @returns {Promise<boolean>} Success status
	 */
	async requestConversationKey(conversationId, wsChat) {
		try {
			console.log(`🔑 Requesting key for conversation: ${conversationId}`);

			const keyRequestMessage = {
				type: 'key_request',
				conversationId,
				requestId: this.generateRequestId(),
				timestamp: Date.now()
			};

			// Send key request
			await this.sendKeyRequestMessage(keyRequestMessage, wsChat);

			// Wait for response (with timeout)
			return new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					this.pendingKeyRequests.delete(keyRequestMessage.requestId);
					reject(new Error('Key request timeout'));
				}, 10000); // 10 second timeout

				this.pendingKeyRequests.set(keyRequestMessage.requestId, {
					conversationId,
					resolve: (success) => {
						clearTimeout(timeout);
						resolve(success);
					},
					reject: (error) => {
						clearTimeout(timeout);
						reject(error);
					}
				});
			});

		} catch (error) {
			console.error('🔑 Failed to request conversation key:', error);
			return false;
		}
	}

	/**
	 * Handle a key request from another participant
	 * @param {Object} keyRequestMessage - Key request message
	 * @param {Object} wsChat - WebSocket chat store
	 * @returns {Promise<boolean>} Success status
	 */
	async handleKeyRequestMessage(keyRequestMessage, wsChat) {
		try {
			const { conversationId, requestId } = keyRequestMessage;

			console.log(`🔑 Received key request for conversation: ${conversationId}`);

			// Check if we have the key for this conversation
			if (!keyManager.hasConversationKey(conversationId)) {
				console.log(`🔑 Don't have key for conversation: ${conversationId}`);
				return false;
			}

			// Get the conversation key
			const keyBase64 = await keyManager.exportConversationKey(conversationId);
			if (!keyBase64) {
				console.error(`🔑 Failed to export key for conversation: ${conversationId}`);
				return false;
			}

			// Send key response
			const keyResponseMessage = {
				type: 'key_response',
				conversationId,
				requestId,
				key: keyBase64,
				timestamp: Date.now()
			};

			await this.sendKeyResponseMessage(keyResponseMessage, wsChat);
			console.log(`🔑 Sent key response for conversation: ${conversationId}`);
			return true;

		} catch (error) {
			console.error('🔑 Failed to handle key request:', error);
			return false;
		}
	}

	/**
	 * Handle a key response message
	 * @param {Object} keyResponseMessage - Key response message
	 * @returns {Promise<boolean>} Success status
	 */
	async handleKeyResponseMessage(keyResponseMessage) {
		try {
			const { conversationId, requestId, key } = keyResponseMessage;

			console.log(`🔑 Received key response for conversation: ${conversationId}`);

			// Check if we have a pending request for this
			const pendingRequest = this.pendingKeyRequests.get(requestId);
			if (!pendingRequest) {
				console.log(`🔑 No pending request found for requestId: ${requestId}`);
				return false;
			}

			// Import the received key
			await keyManager.importConversationKey(conversationId, key);
			await clientEncryption.setConversationKey(conversationId, key);

			// Resolve the pending request
			this.pendingKeyRequests.delete(requestId);
			pendingRequest.resolve(true);

			console.log(`🔑 Successfully received and imported key for conversation: ${conversationId}`);
			return true;

		} catch (error) {
			console.error('🔑 Failed to handle key response:', error);
			
			// Reject pending request if it exists
			const { requestId } = keyResponseMessage;
			const pendingRequest = this.pendingKeyRequests.get(requestId);
			if (pendingRequest) {
				this.pendingKeyRequests.delete(requestId);
				pendingRequest.reject(error);
			}
			
			return false;
		}
	}

	/**
	 * Send a key share message via WebSocket
	 * @param {Object} keyMessage - Key share message
	 * @param {Object} wsChat - WebSocket chat store
	 * @private
	 */
	async sendKeyShareMessage(keyMessage, wsChat) {
		// For now, send as a special system message
		// In production, this would use a dedicated key exchange protocol
		const systemMessage = {
			type: 'system',
			subtype: 'key_share',
			data: keyMessage
		};

		// Send via WebSocket (this would need to be implemented in the WebSocket protocol)
		console.log('🔑 Sending key share message:', systemMessage);
		// wsChat.sendSystemMessage(systemMessage); // This would need to be implemented
	}

	/**
	 * Send a key request message via WebSocket
	 * @param {Object} keyRequestMessage - Key request message
	 * @param {Object} wsChat - WebSocket chat store
	 * @private
	 */
	async sendKeyRequestMessage(keyRequestMessage, wsChat) {
		const systemMessage = {
			type: 'system',
			subtype: 'key_request',
			data: keyRequestMessage
		};

		console.log('🔑 Sending key request message:', systemMessage);
		// wsChat.sendSystemMessage(systemMessage); // This would need to be implemented
	}

	/**
	 * Send a key response message via WebSocket
	 * @param {Object} keyResponseMessage - Key response message
	 * @param {Object} wsChat - WebSocket chat store
	 * @private
	 */
	async sendKeyResponseMessage(keyResponseMessage, wsChat) {
		const systemMessage = {
			type: 'system',
			subtype: 'key_response',
			data: keyResponseMessage
		};

		console.log('🔑 Sending key response message:', systemMessage);
		// wsChat.sendSystemMessage(systemMessage); // This would need to be implemented
	}

	/**
	 * Generate a unique request ID
	 * @returns {string} Request ID
	 * @private
	 */
	generateRequestId() {
		return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Initialize conversation key for a new conversation
	 * @param {string} conversationId - Conversation ID
	 * @param {string[]} participantIds - Array of participant user IDs
	 * @param {Object} wsChat - WebSocket chat store
	 * @returns {Promise<boolean>} Success status
	 */
	async initializeConversationKey(conversationId, participantIds, wsChat) {
		try {
			console.log(`🔑 Initializing conversation key for: ${conversationId}`);

			// Generate a new conversation key
			await clientEncryption.getConversationKey(conversationId); // This will generate if not exists

			// Share the key with all participants
			const success = await this.shareConversationKey(conversationId, participantIds, wsChat);

			if (success) {
				console.log(`🔑 Successfully initialized conversation key for: ${conversationId}`);
			} else {
				console.error(`🔑 Failed to initialize conversation key for: ${conversationId}`);
			}

			return success;

		} catch (error) {
			console.error('🔑 Failed to initialize conversation key:', error);
			return false;
		}
	}

	/**
	 * Handle new participant joining a conversation
	 * @param {string} conversationId - Conversation ID
	 * @param {string} newParticipantId - New participant user ID
	 * @param {Object} wsChat - WebSocket chat store
	 * @returns {Promise<boolean>} Success status
	 */
	async handleNewParticipant(conversationId, newParticipantId, wsChat) {
		try {
			console.log(`🔑 Handling new participant ${newParticipantId} for conversation: ${conversationId}`);

			// Share the existing conversation key with the new participant
			const success = await this.shareConversationKey(conversationId, [newParticipantId], wsChat);

			if (success) {
				console.log(`🔑 Successfully shared key with new participant: ${newParticipantId}`);
			} else {
				console.error(`🔑 Failed to share key with new participant: ${newParticipantId}`);
			}

			return success;

		} catch (error) {
			console.error('🔑 Failed to handle new participant:', error);
			return false;
		}
	}

	/**
	 * Check if we have a key for a conversation, request if not
	 * @param {string} conversationId - Conversation ID
	 * @param {Object} wsChat - WebSocket chat store
	 * @returns {Promise<boolean>} Whether we have the key
	 */
	async ensureConversationKey(conversationId, wsChat) {
		try {
			// Check if we already have the key
			if (keyManager.hasConversationKey(conversationId)) {
				return true;
			}

			console.log(`🔑 Don't have key for conversation ${conversationId}, requesting...`);

			// Request the key from other participants
			const success = await this.requestConversationKey(conversationId, wsChat);
			
			if (success) {
				console.log(`🔑 Successfully obtained key for conversation: ${conversationId}`);
			} else {
				console.error(`🔑 Failed to obtain key for conversation: ${conversationId}`);
			}

			return success;

		} catch (error) {
			console.error('🔑 Failed to ensure conversation key:', error);
			return false;
		}
	}
}

// Create and export singleton instance
export const keyDistribution = new KeyDistributionService();