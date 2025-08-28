/**
 * @fileoverview Tests for multi-recipient encryption service
 * Uses Jest for testing the per-participant message encryption functionality
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { multiRecipientEncryption } from '../../src/lib/crypto/multi-recipient-encryption.js';

// Mock the dependencies
jest.mock('../../src/lib/crypto/asymmetric-encryption.js', () => ({
	asymmetricEncryption: {
		initialize: jest.fn(),
		encryptForRecipient: jest.fn(),
		decryptFromSender: jest.fn(),
		getPublicKey: jest.fn()
	}
}));

jest.mock('../../src/lib/crypto/public-key-service.js', () => ({
	publicKeyService: {
		initialize: jest.fn(),
		getConversationParticipantKeys: jest.fn(),
		getUserPublicKey: jest.fn()
	}
}));

import { asymmetricEncryption } from '../../src/lib/crypto/asymmetric-encryption.js';
import { publicKeyService } from '../../src/lib/crypto/public-key-service.js';

describe('MultiRecipientEncryptionService', () => {
	beforeEach(() => {
		// Reset all mocks before each test
		jest.clearAllMocks();
		
		// Reset the service initialization state
		multiRecipientEncryption.isInitialized = false;
	});

	describe('initialization', () => {
		it('should initialize asymmetric encryption and public key service', async () => {
			asymmetricEncryption.initialize.mockResolvedValue();
			publicKeyService.initialize.mockResolvedValue();

			await multiRecipientEncryption.initialize();

			expect(asymmetricEncryption.initialize).toHaveBeenCalledTimes(1);
			expect(publicKeyService.initialize).toHaveBeenCalledTimes(1);
			expect(multiRecipientEncryption.isReady()).toBe(true);
		});

		it('should not initialize twice', async () => {
			asymmetricEncryption.initialize.mockResolvedValue();
			publicKeyService.initialize.mockResolvedValue();

			await multiRecipientEncryption.initialize();
			await multiRecipientEncryption.initialize();

			expect(asymmetricEncryption.initialize).toHaveBeenCalledTimes(1);
			expect(publicKeyService.initialize).toHaveBeenCalledTimes(1);
		});
	});

	describe('encryptForConversation', () => {
		const conversationId = 'conv-123';
		const messageContent = 'Hello, world!';
		const mockParticipantKeys = new Map([
			['user-1', 'public-key-1'],
			['user-2', 'public-key-2'],
			['user-3', 'public-key-3']
		]);

		beforeEach(async () => {
			asymmetricEncryption.initialize.mockResolvedValue();
			publicKeyService.initialize.mockResolvedValue();
			await multiRecipientEncryption.initialize();
		});

		it('should encrypt message for all conversation participants', async () => {
			publicKeyService.getConversationParticipantKeys.mockResolvedValue(mockParticipantKeys);
			asymmetricEncryption.encryptForRecipient
				.mockResolvedValueOnce('encrypted-for-user-1')
				.mockResolvedValueOnce('encrypted-for-user-2')
				.mockResolvedValueOnce('encrypted-for-user-3');

			const result = await multiRecipientEncryption.encryptForConversation(
				conversationId,
				messageContent
			);

			expect(publicKeyService.getConversationParticipantKeys).toHaveBeenCalledWith(conversationId);
			expect(asymmetricEncryption.encryptForRecipient).toHaveBeenCalledTimes(3);
			expect(asymmetricEncryption.encryptForRecipient).toHaveBeenCalledWith(messageContent, 'public-key-1');
			expect(asymmetricEncryption.encryptForRecipient).toHaveBeenCalledWith(messageContent, 'public-key-2');
			expect(asymmetricEncryption.encryptForRecipient).toHaveBeenCalledWith(messageContent, 'public-key-3');

			expect(result).toEqual({
				'user-1': 'encrypted-for-user-1',
				'user-2': 'encrypted-for-user-2',
				'user-3': 'encrypted-for-user-3'
			});
		});

		it('should throw error when no participant keys found', async () => {
			publicKeyService.getConversationParticipantKeys.mockResolvedValue(new Map());

			await expect(
				multiRecipientEncryption.encryptForConversation(conversationId, messageContent)
			).rejects.toThrow('No participant keys found for conversation');
		});

		it('should continue with other participants if one encryption fails', async () => {
			publicKeyService.getConversationParticipantKeys.mockResolvedValue(mockParticipantKeys);
			asymmetricEncryption.encryptForRecipient
				.mockResolvedValueOnce('encrypted-for-user-1')
				.mockRejectedValueOnce(new Error('Encryption failed for user-2'))
				.mockResolvedValueOnce('encrypted-for-user-3');

			const result = await multiRecipientEncryption.encryptForConversation(
				conversationId,
				messageContent
			);

			expect(result).toEqual({
				'user-1': 'encrypted-for-user-1',
				'user-3': 'encrypted-for-user-3'
			});
		});

		it('should throw error if all encryptions fail', async () => {
			publicKeyService.getConversationParticipantKeys.mockResolvedValue(mockParticipantKeys);
			asymmetricEncryption.encryptForRecipient
				.mockRejectedValue(new Error('Encryption failed'));

			await expect(
				multiRecipientEncryption.encryptForConversation(conversationId, messageContent)
			).rejects.toThrow('Failed to encrypt message for any participants');
		});
	});

	describe('decryptForCurrentUser', () => {
		const encryptedContent = 'encrypted-message';
		const senderPublicKey = 'sender-public-key';
		const decryptedContent = 'Hello, world!';

		beforeEach(async () => {
			asymmetricEncryption.initialize.mockResolvedValue();
			publicKeyService.initialize.mockResolvedValue();
			await multiRecipientEncryption.initialize();
		});

		it('should decrypt message for current user', async () => {
			asymmetricEncryption.decryptFromSender.mockResolvedValue(decryptedContent);

			const result = await multiRecipientEncryption.decryptForCurrentUser(
				encryptedContent,
				senderPublicKey
			);

			expect(asymmetricEncryption.decryptFromSender).toHaveBeenCalledWith(
				encryptedContent,
				senderPublicKey
			);
			expect(result).toBe(decryptedContent);
		});

		it('should throw error if decryption fails', async () => {
			asymmetricEncryption.decryptFromSender.mockRejectedValue(new Error('Decryption failed'));

			await expect(
				multiRecipientEncryption.decryptForCurrentUser(encryptedContent, senderPublicKey)
			).rejects.toThrow('Decryption failed');
		});
	});

	describe('encryptForRecipients', () => {
		const messageContent = 'Hello, world!';
		const recipientUserIds = ['user-1', 'user-2', 'user-3'];

		beforeEach(async () => {
			asymmetricEncryption.initialize.mockResolvedValue();
			publicKeyService.initialize.mockResolvedValue();
			await multiRecipientEncryption.initialize();
		});

		it('should encrypt message for specific recipients', async () => {
			publicKeyService.getUserPublicKey
				.mockResolvedValueOnce('public-key-1')
				.mockResolvedValueOnce('public-key-2')
				.mockResolvedValueOnce('public-key-3');
			
			asymmetricEncryption.encryptForRecipient
				.mockResolvedValueOnce('encrypted-for-user-1')
				.mockResolvedValueOnce('encrypted-for-user-2')
				.mockResolvedValueOnce('encrypted-for-user-3');

			const result = await multiRecipientEncryption.encryptForRecipients(
				messageContent,
				recipientUserIds
			);

			expect(publicKeyService.getUserPublicKey).toHaveBeenCalledTimes(3);
			expect(asymmetricEncryption.encryptForRecipient).toHaveBeenCalledTimes(3);

			expect(result).toEqual({
				'user-1': 'encrypted-for-user-1',
				'user-2': 'encrypted-for-user-2',
				'user-3': 'encrypted-for-user-3'
			});
		});

		it('should skip recipients without public keys', async () => {
			publicKeyService.getUserPublicKey
				.mockResolvedValueOnce('public-key-1')
				.mockResolvedValueOnce(null) // No public key for user-2
				.mockResolvedValueOnce('public-key-3');
			
			asymmetricEncryption.encryptForRecipient
				.mockResolvedValueOnce('encrypted-for-user-1')
				.mockResolvedValueOnce('encrypted-for-user-3');

			const result = await multiRecipientEncryption.encryptForRecipients(
				messageContent,
				recipientUserIds
			);

			expect(asymmetricEncryption.encryptForRecipient).toHaveBeenCalledTimes(2);
			expect(result).toEqual({
				'user-1': 'encrypted-for-user-1',
				'user-3': 'encrypted-for-user-3'
			});
		});
	});

	describe('getUserPublicKey', () => {
		beforeEach(async () => {
			asymmetricEncryption.initialize.mockResolvedValue();
			publicKeyService.initialize.mockResolvedValue();
			await multiRecipientEncryption.initialize();
		});

		it('should return user public key', async () => {
			const mockPublicKey = 'user-public-key';
			asymmetricEncryption.getPublicKey.mockResolvedValue(mockPublicKey);

			const result = await multiRecipientEncryption.getUserPublicKey();

			expect(asymmetricEncryption.getPublicKey).toHaveBeenCalledTimes(1);
			expect(result).toBe(mockPublicKey);
		});
	});
});