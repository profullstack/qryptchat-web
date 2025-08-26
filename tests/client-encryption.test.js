/**
 * @fileoverview Tests for client-side encryption functionality
 * Using Jest for testing framework
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ClientEncryptionService } from '../src/lib/crypto/client-encryption.js';
import { KeyManager } from '../src/lib/crypto/key-manager.js';

// Mock browser environment
global.crypto = {
	getRandomValues: (arr) => {
		for (let i = 0; i < arr.length; i++) {
			arr[i] = Math.floor(Math.random() * 256);
		}
		return arr;
	},
	subtle: {
		encrypt: async (algorithm, key, data) => {
			// Mock encryption - just return the data with a prefix
			const prefix = new TextEncoder().encode('ENCRYPTED:');
			const result = new Uint8Array(prefix.length + data.length);
			result.set(prefix);
			result.set(data, prefix.length);
			return result;
		},
		decrypt: async (algorithm, key, data) => {
			// Mock decryption - remove the prefix
			const prefix = new TextEncoder().encode('ENCRYPTED:');
			if (data.length <= prefix.length) {
				throw new Error('Invalid encrypted data');
			}
			return data.slice(prefix.length);
		},
		importKey: async () => ({ type: 'secret' })
	}
};

// Mock localStorage
const localStorageMock = {
	store: {},
	getItem: function(key) {
		return this.store[key] || null;
	},
	setItem: function(key, value) {
		this.store[key] = value;
	},
	removeItem: function(key) {
		delete this.store[key];
	},
	clear: function() {
		this.store = {};
	}
};

global.localStorage = localStorageMock;

describe('Client-side Encryption', () => {
	let encryptionService;
	let keyManager;

	beforeEach(async () => {
		// Clear localStorage before each test
		localStorageMock.clear();
		
		// Create fresh instances
		encryptionService = new ClientEncryptionService();
		keyManager = new KeyManager();
		
		// Initialize services
		await keyManager.initialize();
		await encryptionService.initialize();
	});

	afterEach(() => {
		// Clean up
		localStorageMock.clear();
	});

	describe('Basic Encryption/Decryption', () => {
		test('should encrypt and decrypt a simple message', async () => {
			const conversationId = 'test-conversation-1';
			const originalMessage = 'Hello, this is a test message!';

			// Encrypt the message
			const encryptedContent = await encryptionService.encryptMessage(conversationId, originalMessage);
			
			// Verify it's encrypted (should be JSON with encrypted structure)
			expect(encryptedContent).not.toBe(originalMessage);
			expect(() => JSON.parse(encryptedContent)).not.toThrow();
			
			const encryptedData = JSON.parse(encryptedContent);
			expect(encryptedData.type).toBe('encrypted');
			expect(encryptedData.nonce).toBeDefined();
			expect(encryptedData.ciphertext).toBeDefined();

			// Decrypt the message
			const decryptedMessage = await encryptionService.decryptMessage(conversationId, encryptedContent);
			
			// Verify decryption worked
			expect(decryptedMessage).toBe(originalMessage);
		});

		test('should handle plain text messages gracefully', async () => {
			const conversationId = 'test-conversation-2';
			const plainMessage = 'This is plain text';

			// Try to decrypt plain text (should return as-is)
			const result = await encryptionService.decryptMessage(conversationId, plainMessage);
			expect(result).toBe(plainMessage);
		});

		test('should handle encryption failures gracefully', async () => {
			const conversationId = 'test-conversation-3';
			const message = 'Test message';

			// Mock crypto.subtle.encrypt to throw an error
			const originalEncrypt = global.crypto.subtle.encrypt;
			global.crypto.subtle.encrypt = async () => {
				throw new Error('Encryption failed');
			};

			// Should fall back to plain text
			const result = await encryptionService.encryptMessage(conversationId, message);
			expect(result).toBe(message);

			// Restore original function
			global.crypto.subtle.encrypt = originalEncrypt;
		});
	});

	describe('Key Management', () => {
		test('should generate and store conversation keys', async () => {
			const conversationId = 'test-conversation-4';

			// Check that no key exists initially
			expect(keyManager.hasConversationKey(conversationId)).toBe(false);

			// Generate a key
			const key = await keyManager.generateConversationKey(conversationId);
			
			// Verify key was generated and stored
			expect(key).toBeInstanceOf(Uint8Array);
			expect(key.length).toBe(32);
			expect(keyManager.hasConversationKey(conversationId)).toBe(true);

			// Retrieve the same key
			const retrievedKey = await keyManager.getConversationKey(conversationId);
			expect(retrievedKey).toEqual(key);
		});

		test('should persist keys to localStorage', async () => {
			const conversationId = 'test-conversation-5';

			// Generate and store a key
			await keyManager.generateConversationKey(conversationId);

			// Verify it's in localStorage
			const stored = JSON.parse(localStorage.getItem('qryptchat_keys'));
			expect(stored[conversationId]).toBeDefined();
			expect(stored[conversationId].key).toBeDefined();
			expect(stored[conversationId].timestamp).toBeDefined();
		});

		test('should load keys from localStorage on initialization', async () => {
			const conversationId = 'test-conversation-6';

			// Manually store a key in localStorage
			const keyData = {
				conversationId,
				key: 'dGVzdC1rZXktZGF0YQ==', // base64 encoded test data
				timestamp: Date.now()
			};
			localStorage.setItem('qryptchat_keys', JSON.stringify({
				[conversationId]: keyData
			}));

			// Create new key manager and initialize
			const newKeyManager = new KeyManager();
			await newKeyManager.initialize();

			// Verify key was loaded
			expect(newKeyManager.hasConversationKey(conversationId)).toBe(true);
		});

		test('should export and import keys', async () => {
			const conversationId = 'test-conversation-7';

			// Generate a key
			const originalKey = await keyManager.generateConversationKey(conversationId);

			// Export the key
			const exportedKey = await keyManager.exportConversationKey(conversationId);
			expect(exportedKey).toBeDefined();
			expect(typeof exportedKey).toBe('string');

			// Clear the key
			await keyManager.removeConversationKey(conversationId);
			expect(keyManager.hasConversationKey(conversationId)).toBe(false);

			// Import the key back
			await keyManager.importConversationKey(conversationId, exportedKey);
			expect(keyManager.hasConversationKey(conversationId)).toBe(true);

			// Verify it's the same key
			const importedKey = await keyManager.getConversationKey(conversationId);
			expect(importedKey).toEqual(originalKey);
		});
	});

	describe('Integration Tests', () => {
		test('should maintain encryption across multiple messages', async () => {
			const conversationId = 'test-conversation-8';
			const messages = [
				'First message',
				'Second message with emojis 🔐💬',
				'Third message with special chars: !@#$%^&*()',
			];

			// Encrypt all messages
			const encryptedMessages = [];
			for (const message of messages) {
				const encrypted = await encryptionService.encryptMessage(conversationId, message);
				encryptedMessages.push(encrypted);
			}

			// Verify all are encrypted differently
			for (let i = 0; i < encryptedMessages.length; i++) {
				expect(encryptedMessages[i]).not.toBe(messages[i]);
				for (let j = i + 1; j < encryptedMessages.length; j++) {
					expect(encryptedMessages[i]).not.toBe(encryptedMessages[j]);
				}
			}

			// Decrypt all messages
			const decryptedMessages = [];
			for (const encrypted of encryptedMessages) {
				const decrypted = await encryptionService.decryptMessage(conversationId, encrypted);
				decryptedMessages.push(decrypted);
			}

			// Verify all decrypted correctly
			expect(decryptedMessages).toEqual(messages);
		});

		test('should handle different conversations independently', async () => {
			const conversation1 = 'test-conversation-9';
			const conversation2 = 'test-conversation-10';
			const message = 'Same message, different conversations';

			// Encrypt same message in different conversations
			const encrypted1 = await encryptionService.encryptMessage(conversation1, message);
			const encrypted2 = await encryptionService.encryptMessage(conversation2, message);

			// Should be encrypted differently (different keys)
			expect(encrypted1).not.toBe(encrypted2);

			// Should decrypt correctly in their respective conversations
			const decrypted1 = await encryptionService.decryptMessage(conversation1, encrypted1);
			const decrypted2 = await encryptionService.decryptMessage(conversation2, encrypted2);

			expect(decrypted1).toBe(message);
			expect(decrypted2).toBe(message);

			// Cross-conversation decryption should fail gracefully
			const crossDecrypted1 = await encryptionService.decryptMessage(conversation2, encrypted1);
			const crossDecrypted2 = await encryptionService.decryptMessage(conversation1, encrypted2);

			expect(crossDecrypted1).toBe('[Encrypted message - decryption failed]');
			expect(crossDecrypted2).toBe('[Encrypted message - decryption failed]');
		});
	});
});