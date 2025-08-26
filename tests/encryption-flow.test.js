/**
 * @fileoverview Test encryption/decryption flow
 * Tests the simplified ChaCha20-Poly1305 encryption system
 */

import { describe, it, beforeEach, vi } from 'vitest';
import { expect } from 'vitest';
import { ClientEncryptionService } from '../src/lib/crypto/client-encryption.js';

// Mock localStorage for testing
const mockLocalStorage = {
	data: {},
	getItem(key) {
		return this.data[key] || null;
	},
	setItem(key, value) {
		this.data[key] = value;
	},
	removeItem(key) {
		delete this.data[key];
	},
	clear() {
		this.data = {};
	}
};

// Mock window and crypto
vi.stubGlobal('localStorage', mockLocalStorage);
vi.stubGlobal('window', {
	localStorage: mockLocalStorage
});

// Use Node.js crypto for testing
import { webcrypto } from 'node:crypto';
vi.stubGlobal('crypto', webcrypto);

describe('Simplified Encryption Flow', () => {
	let encryptionService;
	const conversationId = 'test-conversation-123';
	const testMessage = 'Hello, this is a test message!';

	beforeEach(async () => {
		// Clear localStorage before each test
		global.localStorage.clear();
		
		// Create new encryption service instance
		encryptionService = new ClientEncryptionService();
		await encryptionService.initialize();
	});

	it('should initialize encryption service', async () => {
		expect(encryptionService.isInitialized).to.be.true;
	});

	it('should generate conversation key', async () => {
		const key = await encryptionService.getConversationKey(conversationId);
		expect(key).to.be.instanceOf(Uint8Array);
		expect(key.length).to.equal(32); // 256-bit key
	});

	it('should encrypt and decrypt message successfully', async () => {
		// Encrypt message
		const encryptedContent = await encryptionService.encryptMessage(conversationId, testMessage);
		expect(encryptedContent).to.be.a('string');
		expect(encryptedContent).to.not.equal(testMessage);

		// Verify it's JSON format
		const encryptedData = JSON.parse(encryptedContent);
		expect(encryptedData).to.have.property('v', 1);
		expect(encryptedData).to.have.property('n');
		expect(encryptedData).to.have.property('c');

		// Decrypt message
		const decryptedContent = await encryptionService.decryptMessage(conversationId, encryptedContent);
		expect(decryptedContent).to.equal(testMessage);
	});

	it('should use same key for same conversation', async () => {
		const key1 = await encryptionService.getConversationKey(conversationId);
		const key2 = await encryptionService.getConversationKey(conversationId);
		
		// Keys should be the same
		expect(key1).to.deep.equal(key2);
	});

	it('should persist keys in localStorage', async () => {
		// Generate key
		await encryptionService.getConversationKey(conversationId);
		
		// Create new service instance
		const newService = new ClientEncryptionService();
		await newService.initialize();
		
		// Should retrieve same key from storage
		const retrievedKey = await newService.getConversationKey(conversationId);
		expect(retrievedKey).to.be.instanceOf(Uint8Array);
		expect(retrievedKey.length).to.equal(32);
	});

	it('should handle different conversations with different keys', async () => {
		const conversationId1 = 'conversation-1';
		const conversationId2 = 'conversation-2';
		
		const key1 = await encryptionService.getConversationKey(conversationId1);
		const key2 = await encryptionService.getConversationKey(conversationId2);
		
		// Keys should be different
		expect(key1).to.not.deep.equal(key2);
	});

	it('should handle plain text messages (legacy support)', async () => {
		const plainText = 'This is plain text';
		const result = await encryptionService.decryptMessage(conversationId, plainText);
		expect(result).to.equal(plainText);
	});

	it('should handle decryption failure gracefully', async () => {
		const invalidEncrypted = '{"v":1,"n":"invalid","c":"invalid"}';
		const result = await encryptionService.decryptMessage(conversationId, invalidEncrypted);
		expect(result).to.equal('[Encrypted message - decryption failed]');
	});

	it('should clear conversation keys', async () => {
		// Generate key
		await encryptionService.getConversationKey(conversationId);
		expect(encryptionService.isEncryptionActive(conversationId)).to.be.true;
		
		// Clear key
		await encryptionService.clearConversationKey(conversationId);
		expect(encryptionService.isEncryptionActive(conversationId)).to.be.false;
	});

	it('should export and import conversation keys', async () => {
		// Generate key
		await encryptionService.getConversationKey(conversationId);
		
		// Export key
		const exportedKey = await encryptionService.getConversationKeyBase64(conversationId);
		expect(exportedKey).to.be.a('string');
		
		// Clear key
		await encryptionService.clearConversationKey(conversationId);
		expect(encryptionService.isEncryptionActive(conversationId)).to.be.false;
		
		// Import key
		await encryptionService.setConversationKey(conversationId, exportedKey);
		expect(encryptionService.isEncryptionActive(conversationId)).to.be.true;
		
		// Should be able to decrypt with imported key
		const encryptedContent = await encryptionService.encryptMessage(conversationId, testMessage);
		const decryptedContent = await encryptionService.decryptMessage(conversationId, encryptedContent);
		expect(decryptedContent).to.equal(testMessage);
	});
});