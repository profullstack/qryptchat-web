/**
 * @fileoverview Tests for asymmetric encryption service
 */

import { expect } from 'chai';
import { vi } from 'vitest';
import { AsymmetricEncryptionService } from '../src/lib/crypto/asymmetric-encryption.js';

describe('AsymmetricEncryptionService', () => {
	let service1, service2;
	let mockStorage;

	beforeEach(async () => {
		// Create a mock storage that works with the existing test setup
		mockStorage = new Map();
		
		// Mock localStorage methods to use our Map
		window.localStorage.getItem.mockImplementation((key) => mockStorage.get(key) || null);
		window.localStorage.setItem.mockImplementation((key, value) => mockStorage.set(key, value));
		window.localStorage.removeItem.mockImplementation((key) => mockStorage.delete(key));
		window.localStorage.clear.mockImplementation(() => mockStorage.clear());
		
		// Create two separate encryption services (simulating two users)
		service1 = new AsymmetricEncryptionService();
		service2 = new AsymmetricEncryptionService();
		
		await service1.initialize();
		await service2.initialize();
	});

	afterEach(() => {
		mockStorage.clear();
	});

	describe('Key Generation', () => {
		it('should generate user keys on first use', async () => {
			const keys = await service1.getUserKeys();
			
			expect(keys).to.be.an('object');
			expect(keys.publicKey).to.be.a('string');
			expect(keys.privateKey).to.be.a('string');
			expect(keys.publicKey.length).to.be.greaterThan(0);
			expect(keys.privateKey.length).to.be.greaterThan(0);
		});

		it('should persist keys to localStorage', async () => {
			await service1.getUserKeys();
			
			const stored = localStorage.getItem('qryptchat_user_keypair');
			expect(stored).to.not.be.null;
			
			const keyData = JSON.parse(stored);
			expect(keyData.publicKey).to.be.a('string');
			expect(keyData.privateKey).to.be.a('string');
			expect(keyData.version).to.equal('2.0');
		});

		it('should load existing keys from localStorage', async () => {
			// Generate keys with first service
			const keys1 = await service1.getUserKeys();
			
			// Create new service instance and load same keys
			const service3 = new AsymmetricEncryptionService();
			await service3.initialize();
			const keys3 = await service3.getUserKeys();
			
			expect(keys3.publicKey).to.equal(keys1.publicKey);
			expect(keys3.privateKey).to.equal(keys1.privateKey);
		});

		it('should generate different keys for different users', async () => {
			const keys1 = await service1.getUserKeys();
			
			// Clear localStorage and create new service
			localStorage.clear();
			const service3 = new AsymmetricEncryptionService();
			await service3.initialize();
			const keys3 = await service3.getUserKeys();
			
			expect(keys1.publicKey).to.not.equal(keys3.publicKey);
			expect(keys1.privateKey).to.not.equal(keys3.privateKey);
		});
	});

	describe('Public Key Management', () => {
		it('should return public key', async () => {
			const publicKey = await service1.getPublicKey();
			expect(publicKey).to.be.a('string');
			expect(publicKey.length).to.be.greaterThan(0);
		});

		it('should store and retrieve public keys for other users', () => {
			const testUserId = 'user123';
			const testPublicKey = 'test-public-key-base64';
			
			service1.storePublicKey(testUserId, testPublicKey);
			const retrieved = service1.getStoredPublicKey(testUserId);
			
			expect(retrieved).to.equal(testPublicKey);
		});

		it('should return null for unknown user public keys', () => {
			const retrieved = service1.getStoredPublicKey('unknown-user');
			expect(retrieved).to.be.null;
		});
	});

	describe('Message Encryption/Decryption', () => {
		it('should encrypt and decrypt messages between two users', async () => {
			const message = 'Hello, this is a secret message!';
			
			// Get public keys for both users
			const publicKey1 = await service1.getPublicKey();
			const publicKey2 = await service2.getPublicKey();
			
			// User 1 encrypts message for User 2
			const encrypted = await service1.encryptForRecipient(message, publicKey2);
			expect(encrypted).to.be.a('string');
			expect(encrypted).to.not.equal(message);
			
			// User 2 decrypts message from User 1
			const decrypted = await service2.decryptFromSender(encrypted, publicKey1);
			expect(decrypted).to.equal(message);
		});

		it('should handle different message types', async () => {
			const messages = [
				'Simple message',
				'Message with émojis 🔐🚀',
				'Message with special chars: !@#$%^&*()',
				'Very long message: ' + 'A'.repeat(1000),
				''  // Empty message
			];
			
			const publicKey1 = await service1.getPublicKey();
			const publicKey2 = await service2.getPublicKey();
			
			for (const message of messages) {
				const encrypted = await service1.encryptForRecipient(message, publicKey2);
				const decrypted = await service2.decryptFromSender(encrypted, publicKey1);
				expect(decrypted).to.equal(message);
			}
		});

		it('should fail to decrypt with wrong sender key', async () => {
			const message = 'Secret message';
			
			const publicKey1 = await service1.getPublicKey();
			const publicKey2 = await service2.getPublicKey();
			
			// User 1 encrypts for User 2
			const encrypted = await service1.encryptForRecipient(message, publicKey2);
			
			// Try to decrypt with wrong sender key (should fail)
			const wrongPublicKey = 'wrong-key-base64';
			const decrypted = await service2.decryptFromSender(encrypted, wrongPublicKey);
			
			expect(decrypted).to.equal('[Encrypted message - decryption failed]');
		});

		it('should handle non-encrypted content gracefully', async () => {
			const plainText = 'This is not encrypted';
			const publicKey1 = await service1.getPublicKey();
			
			// Should return the content as-is if it's not encrypted
			const result = await service2.decryptFromSender(plainText, publicKey1);
			expect(result).to.equal(plainText);
		});

		it('should handle malformed encrypted content', async () => {
			const malformed = '{"v":2,"n":"invalid","c":"invalid"}';
			const publicKey1 = await service1.getPublicKey();
			
			const result = await service2.decryptFromSender(malformed, publicKey1);
			expect(result).to.equal('[Encrypted message - decryption failed]');
		});
	});

	describe('Key Management', () => {
		it('should clear all user keys', async () => {
			// Generate keys
			await service1.getUserKeys();
			expect(localStorage.getItem('qryptchat_user_keypair')).to.not.be.null;
			
			// Clear keys
			await service1.clearUserKeys();
			expect(localStorage.getItem('qryptchat_user_keypair')).to.be.null;
			expect(service1.userKeys).to.be.null;
		});

		it('should export user keys', async () => {
			const keys = await service1.getUserKeys();
			const exported = await service1.exportUserKeys();
			
			expect(exported.publicKey).to.equal(keys.publicKey);
			expect(exported.privateKey).to.equal(keys.privateKey);
		});

		it('should import user keys', async () => {
			const testKeys = {
				publicKey: 'test-public-key',
				privateKey: 'test-private-key'
			};
			
			await service1.importUserKeys(testKeys.publicKey, testKeys.privateKey);
			
			const imported = await service1.getUserKeys();
			expect(imported.publicKey).to.equal(testKeys.publicKey);
			expect(imported.privateKey).to.equal(testKeys.privateKey);
			
			// Should be persisted
			const stored = localStorage.getItem('qryptchat_user_keypair');
			const keyData = JSON.parse(stored);
			expect(keyData.publicKey).to.equal(testKeys.publicKey);
			expect(keyData.privateKey).to.equal(testKeys.privateKey);
		});
	});

	describe('Error Handling', () => {
		it('should handle encryption errors gracefully', async () => {
			const invalidPublicKey = 'invalid-key';
			
			try {
				await service1.encryptForRecipient('test message', invalidPublicKey);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error).to.be.an('error');
			}
		});

		it('should handle initialization without browser environment', async () => {
			// Temporarily remove window
			const originalWindow = global.window;
			delete global.window;
			
			const service = new AsymmetricEncryptionService();
			await service.initialize(); // Should not throw
			
			expect(service.isInitialized).to.be.true;
			
			// Restore window
			global.window = originalWindow;
		});
	});
});