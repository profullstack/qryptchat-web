/**
 * @fileoverview Simple encryption test without setup conflicts
 * Tests the simplified ChaCha20-Poly1305 encryption system
 */

import { describe, it, beforeEach, expect } from 'vitest';
import { ClientEncryptionService } from '../src/lib/crypto/client-encryption.js';

// Use Node.js crypto for testing
import { webcrypto } from 'node:crypto';
Object.defineProperty(globalThis, 'crypto', {
	value: webcrypto,
	writable: false
});

describe('Simple Encryption Test', () => {
	let encryptionService;
	const conversationId = 'test-conversation-123';
	const testMessage = 'Hello, this is a test message!';

	beforeEach(async () => {
		// Create new encryption service instance
		encryptionService = new ClientEncryptionService();
		await encryptionService.initialize();
	});

	it('should encrypt and decrypt message successfully', async () => {
		// Encrypt message
		const encryptedContent = await encryptionService.encryptMessage(conversationId, testMessage);
		expect(encryptedContent).toBeTruthy();
		expect(encryptedContent).not.toEqual(testMessage);

		// Verify it's post-quantum JSON format
		const encryptedData = JSON.parse(encryptedContent);
		expect(encryptedData.v).toBe(3); // Version 3 for post-quantum
		expect(encryptedData.alg).toBe('ML-KEM-768'); // Post-quantum algorithm
		expect(encryptedData.kem).toBeTruthy(); // KEM ciphertext
		expect(encryptedData.n).toBeTruthy(); // Nonce
		expect(encryptedData.c).toBeTruthy(); // Message ciphertext

		// Decrypt message
		const decryptedContent = await encryptionService.decryptMessage(conversationId, encryptedContent);
		expect(decryptedContent).toBe(testMessage);
	});

	it('should handle plain text messages (legacy support)', async () => {
		const plainText = 'This is plain text';
		const result = await encryptionService.decryptMessage(conversationId, plainText);
		expect(result).toBe(plainText);
	});

	it('should handle decryption failure gracefully', async () => {
		const invalidEncrypted = '{"v":3,"alg":"ML-KEM-768","kem":"invalid","n":"invalid","c":"invalid"}';
		const result = await encryptionService.decryptMessage(conversationId, invalidEncrypted);
		expect(result).toBe('[Encrypted message - decryption failed]');
	});
});