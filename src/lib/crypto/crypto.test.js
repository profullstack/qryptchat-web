/**
 * @fileoverview Tests for QryptChat Post-Quantum Cryptography
 * Using Vitest for testing the ML-KEM-768 post-quantum encryption
 */

import { describe, it, expect } from 'vitest';
import {
	CRYPTO_CONFIG,
	Base64,
	SecureRandom,
	HKDF,
	ChaCha20Poly1305,
	CryptoUtils
} from './index.js';
import { postQuantumEncryption } from './post-quantum-encryption.js';
import { multiRecipientEncryption } from './multi-recipient-encryption.js';

describe('Crypto Utilities', () => {
	describe('Base64', () => {
		it('should encode and decode correctly', () => {
			const original = new Uint8Array([1, 2, 3, 4, 5]);
			const encoded = Base64.encode(original);
			const decoded = Base64.decode(encoded);
			
			expect(decoded).toEqual(original);
		});
	});

	describe('SecureRandom', () => {
		it('should generate random bytes of correct length', () => {
			const bytes = SecureRandom.getRandomBytes(32);
			expect(bytes.length).toBe(32);
		});

		it('should generate different random values', () => {
			const bytes1 = SecureRandom.getRandomBytes(16);
			const bytes2 = SecureRandom.getRandomBytes(16);
			expect(bytes1).not.toEqual(bytes2);
		});
	});

	describe('HKDF', () => {
		it('should derive consistent keys from same input', async () => {
			const ikm = SecureRandom.getRandomBytes(32);
			const salt = SecureRandom.getRandomBytes(16);
			const info = 'test-context';
			
			const key1 = await HKDF.derive(ikm, salt, info, 32);
			const key2 = await HKDF.derive(ikm, salt, info, 32);
			
			expect(key1).toEqual(key2);
		});

		it('should derive different keys for different contexts', async () => {
			const ikm = SecureRandom.getRandomBytes(32);
			const salt = SecureRandom.getRandomBytes(16);
			
			const key1 = await HKDF.derive(ikm, salt, 'context1', 32);
			const key2 = await HKDF.derive(ikm, salt, 'context2', 32);
			
			expect(key1).not.toEqual(key2);
		});
	});

	describe('ChaCha20Poly1305', () => {
		it('should encrypt and decrypt correctly', async () => {
			const key = SecureRandom.getRandomBytes(32);
			const nonce = SecureRandom.getRandomBytes(12);
			const plaintext = new TextEncoder().encode('Hello, QryptChat!');
			
			const ciphertext = await ChaCha20Poly1305.encrypt(key, nonce, plaintext);
			const decrypted = await ChaCha20Poly1305.decrypt(key, nonce, ciphertext);
			
			expect(decrypted).toEqual(plaintext);
		});

		it('should fail with wrong key', async () => {
			const key1 = SecureRandom.getRandomBytes(32);
			const key2 = SecureRandom.getRandomBytes(32);
			const nonce = SecureRandom.getRandomBytes(12);
			const plaintext = new TextEncoder().encode('Hello, QryptChat!');
			
			const ciphertext = await ChaCha20Poly1305.encrypt(key1, nonce, plaintext);
			
			await expect(
				ChaCha20Poly1305.decrypt(key2, nonce, ciphertext)
			).rejects.toThrow();
		});
	});
});

describe('Post-Quantum Encryption (ML-KEM-768)', () => {
	describe('Key Generation', () => {
		it('should generate ML-KEM-768 key pair', async () => {
			await postQuantumEncryption.initialize();
			const keys = await postQuantumEncryption.getUserKeys();
			
			expect(keys).toHaveProperty('publicKey');
			expect(keys).toHaveProperty('privateKey');
			expect(typeof keys.publicKey).toBe('string');
			expect(typeof keys.privateKey).toBe('string');
		});

		it('should generate different key pairs', async () => {
			await postQuantumEncryption.initialize();
			const keys1 = await postQuantumEncryption.generateUserKeys();
			const keys2 = await postQuantumEncryption.generateUserKeys();
			
			expect(keys1.publicKey).not.toBe(keys2.publicKey);
			expect(keys1.privateKey).not.toBe(keys2.privateKey);
		});
	});

	describe('Encryption and Decryption', () => {
		it('should encrypt and decrypt messages correctly', async () => {
			await postQuantumEncryption.initialize();
			const keys = await postQuantumEncryption.getUserKeys();
			const message = 'Hello, post-quantum world!';
			
			// Encrypt message
			const encrypted = await postQuantumEncryption.encryptForRecipient(message, keys.publicKey);
			expect(typeof encrypted).toBe('string');
			
			// Decrypt message
			const decrypted = await postQuantumEncryption.decryptFromSender(encrypted, keys.publicKey);
			expect(decrypted).toBe(message);
		});

		it('should fail decryption with wrong private key', async () => {
			await postQuantumEncryption.initialize();
			const keys1 = await postQuantumEncryption.generateUserKeys();
			const keys2 = await postQuantumEncryption.generateUserKeys();
			const message = 'Secret message';
			
			// Encrypt with keys1
			const encrypted = await postQuantumEncryption.encryptForRecipient(message, keys1.publicKey);
			
			// Try to decrypt with keys2 (should fail)
			const decrypted = await postQuantumEncryption.decryptFromSender(encrypted, keys2.publicKey);
			expect(decrypted).toBe('[Encrypted message - decryption failed]');
		});

		it('should handle different message lengths', async () => {
			await postQuantumEncryption.initialize();
			const keys = await postQuantumEncryption.getUserKeys();
			
			const messages = [
				'Short',
				'This is a medium length message for testing',
				'This is a very long message that contains multiple sentences and should test the encryption system with larger amounts of data to ensure it works correctly with various message sizes.'
			];
			
			for (const message of messages) {
				const encrypted = await postQuantumEncryption.encryptForRecipient(message, keys.publicKey);
				const decrypted = await postQuantumEncryption.decryptFromSender(encrypted, keys.publicKey);
				expect(decrypted).toBe(message);
			}
		});
	});

	describe('Algorithm Information', () => {
		it('should return correct algorithm info', async () => {
			await postQuantumEncryption.initialize();
			const info = postQuantumEncryption.getAlgorithmInfo();
			
			expect(info.name).toBe('ML-KEM-768');
			expect(info.quantumResistant).toBe(true);
			expect(info.securityLevel).toBe(3);
		});
	});
});

describe('Multi-Recipient Encryption', () => {
	describe('Service Initialization', () => {
		it('should initialize successfully', async () => {
			await multiRecipientEncryption.initialize();
			expect(multiRecipientEncryption.isReady()).toBe(true);
		});
	});

	describe('Message Encryption for Multiple Recipients', () => {
		it('should encrypt message for multiple recipients', async () => {
			await multiRecipientEncryption.initialize();
			
			// Generate test keys for multiple users
			const user1Keys = await postQuantumEncryption.generateUserKeys();
			const user2Keys = await postQuantumEncryption.generateUserKeys();
			const user3Keys = await postQuantumEncryption.generateUserKeys();
			
			const message = 'Hello to all recipients!';
			const recipientIds = ['user1', 'user2', 'user3'];
			
			// Mock the public key service to return our test keys
			const originalGetUserPublicKey = multiRecipientEncryption.publicKeyService?.getUserPublicKey;
			if (multiRecipientEncryption.publicKeyService) {
				multiRecipientEncryption.publicKeyService.getUserPublicKey = async (userId) => {
					switch (userId) {
						case 'user1': return user1Keys.publicKey;
						case 'user2': return user2Keys.publicKey;
						case 'user3': return user3Keys.publicKey;
						default: return null;
					}
				};
			}
			
			try {
				const encryptedContents = await multiRecipientEncryption.encryptForRecipients(message, recipientIds);
				
				expect(Object.keys(encryptedContents)).toHaveLength(3);
				expect(encryptedContents).toHaveProperty('user1');
				expect(encryptedContents).toHaveProperty('user2');
				expect(encryptedContents).toHaveProperty('user3');
				
				// Each encrypted content should be different
				expect(encryptedContents.user1).not.toBe(encryptedContents.user2);
				expect(encryptedContents.user2).not.toBe(encryptedContents.user3);
			} finally {
				// Restore original method
				if (originalGetUserPublicKey && multiRecipientEncryption.publicKeyService) {
					multiRecipientEncryption.publicKeyService.getUserPublicKey = originalGetUserPublicKey;
				}
			}
		});
	});
});

describe('CryptoUtils', () => {
	it('should perform constant time comparison', () => {
		const a = new Uint8Array([1, 2, 3, 4]);
		const b = new Uint8Array([1, 2, 3, 4]);
		const c = new Uint8Array([1, 2, 3, 5]);
		
		expect(CryptoUtils.constantTimeEqual(a, b)).toBe(true);
		expect(CryptoUtils.constantTimeEqual(a, c)).toBe(false);
	});

	it('should concatenate arrays correctly', () => {
		const a = new Uint8Array([1, 2]);
		const b = new Uint8Array([3, 4]);
		const c = new Uint8Array([5, 6]);
		
		const result = CryptoUtils.concatenate(a, b, c);
		const expected = new Uint8Array([1, 2, 3, 4, 5, 6]);
		
		expect(result).toEqual(expected);
	});

	it('should generate unique key IDs', () => {
		const id1 = CryptoUtils.generateKeyId();
		const id2 = CryptoUtils.generateKeyId();
		
		expect(id1).not.toBe(id2);
		expect(id1.length).toBeGreaterThan(0);
		expect(id2.length).toBeGreaterThan(0);
	});

	it('should hash data consistently', async () => {
		const data = new TextEncoder().encode('test data');
		const hash1 = await CryptoUtils.hash(data);
		const hash2 = await CryptoUtils.hash(data);
		
		expect(hash1).toEqual(hash2);
		expect(hash1.length).toBe(32); // SHA-256 produces 32-byte hashes
	});
});