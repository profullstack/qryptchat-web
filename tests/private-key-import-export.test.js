/**
 * @fileoverview Tests for private key import/export functionality
 * Using Vitest test framework
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeyManager } from '../src/lib/crypto/key-manager.js';
import { PrivateKeyManager } from '../src/lib/crypto/private-key-manager.js';
import { Base64, CryptoUtils } from '../src/lib/crypto/index.js';

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true,
}));

describe('Private Key Import/Export', () => {
	let keyManager;
	let privateKeyManager;

	beforeEach(async () => {
		// Mock localStorage
		const localStorageMock = {
			data: {},
			getItem: vi.fn((key) => localStorageMock.data[key] || null),
			setItem: vi.fn((key, value) => { localStorageMock.data[key] = value; }),
			removeItem: vi.fn((key) => { delete localStorageMock.data[key]; }),
			clear: vi.fn(() => { localStorageMock.data = {}; })
		};
		global.localStorage = localStorageMock;

		// Mock crypto.getRandomValues
		global.crypto = {
			getRandomValues: vi.fn((array) => {
				for (let i = 0; i < array.length; i++) {
					array[i] = Math.floor(Math.random() * 256);
				}
				return array;
			}),
			subtle: {
				importKey: vi.fn(),
				deriveBits: vi.fn(),
				digest: vi.fn()
			}
		};

		keyManager = new KeyManager();
		privateKeyManager = new PrivateKeyManager();
		await keyManager.initialize();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Export Private Keys', () => {
		it('should export user private keys as encrypted JSON', async () => {
			// Generate test keys
			await keyManager.generateUserKeys();

			// Export keys with password
			const password = 'test-password-123';
			const exportedData = await privateKeyManager.exportPrivateKeys(password);

			expect(exportedData).toBeTypeOf('string');
			
			// Should be valid JSON
			const parsed = JSON.parse(exportedData);
			expect(parsed).toHaveProperty('version');
			expect(parsed).toHaveProperty('timestamp');
			expect(parsed).toHaveProperty('encryptedKeys');
			expect(parsed).toHaveProperty('salt');
			expect(parsed).toHaveProperty('nonce');
			expect(parsed.version).toBe('1.0');
		});

		it('should throw error when no user keys exist', async () => {
			const password = 'test-password-123';
			
			await expect(privateKeyManager.exportPrivateKeys(password))
				.rejects.toThrow('No user keys found');
		});

		it('should throw error with empty password', async () => {
			await keyManager.generateUserKeys();
			
			await expect(privateKeyManager.exportPrivateKeys(''))
				.rejects.toThrow('Password is required');
		});

		it('should generate different exports with same keys but different passwords', async () => {
			await keyManager.generateUserKeys();

			const export1 = await privateKeyManager.exportPrivateKeys('password1');
			const export2 = await privateKeyManager.exportPrivateKeys('password2');

			expect(export1).not.toBe(export2);
			
			const parsed1 = JSON.parse(export1);
			const parsed2 = JSON.parse(export2);
			
			// Different salts and encrypted data
			expect(parsed1.salt).not.toBe(parsed2.salt);
			expect(parsed1.encryptedKeys).not.toBe(parsed2.encryptedKeys);
		});
	});

	describe('Import Private Keys', () => {
		it('should import previously exported keys successfully', async () => {
			// Generate and export keys
			await keyManager.generateUserKeys();
			const originalKeys = await keyManager.getUserKeys();
			
			const password = 'test-password-123';
			const exportedData = await privateKeyManager.exportPrivateKeys(password);

			// Clear keys
			await keyManager.clearUserKeys();
			expect(await keyManager.hasUserKeys()).toBe(false);

			// Import keys
			await privateKeyManager.importPrivateKeys(exportedData, password);

			// Verify keys are restored
			expect(await keyManager.hasUserKeys()).toBe(true);
			const restoredKeys = await keyManager.getUserKeys();
			
			expect(restoredKeys.masterKey).toBe(originalKeys.masterKey);
			expect(restoredKeys.keyExchangeKey).toBe(originalKeys.keyExchangeKey);
		});

		it('should throw error with wrong password', async () => {
			await keyManager.generateUserKeys();
			const exportedData = await privateKeyManager.exportPrivateKeys('correct-password');

			await expect(privateKeyManager.importPrivateKeys(exportedData, 'wrong-password'))
				.rejects.toThrow('Invalid password or corrupted data');
		});

		it('should throw error with invalid JSON format', async () => {
			const invalidData = 'not-valid-json';
			
			await expect(privateKeyManager.importPrivateKeys(invalidData, 'password'))
				.rejects.toThrow('Invalid export format');
		});

		it('should throw error with missing required fields', async () => {
			const incompleteData = JSON.stringify({
				version: '1.0',
				timestamp: Date.now()
				// Missing encryptedKeys, salt, nonce
			});
			
			await expect(privateKeyManager.importPrivateKeys(incompleteData, 'password'))
				.rejects.toThrow('Invalid export format');
		});

		it('should throw error with unsupported version', async () => {
			const futureVersionData = JSON.stringify({
				version: '2.0',
				timestamp: Date.now(),
				encryptedKeys: 'test',
				salt: 'test',
				nonce: 'test'
			});
			
			await expect(privateKeyManager.importPrivateKeys(futureVersionData, 'password'))
				.rejects.toThrow('Unsupported export version');
		});

		it('should overwrite existing keys when importing', async () => {
			// Generate initial keys
			await keyManager.generateUserKeys();
			const initialKeys = await keyManager.getUserKeys();

			// Generate different keys and export them
			await keyManager.clearUserKeys();
			await keyManager.generateUserKeys();
			const newKeys = await keyManager.getUserKeys();
			
			const password = 'test-password';
			const exportedData = await privateKeyManager.exportPrivateKeys(password);

			// Restore initial keys
			await keyManager.clearUserKeys();
			localStorage.setItem('qryptchat_user_keys', JSON.stringify(initialKeys));

			// Import the new keys (should overwrite)
			await privateKeyManager.importPrivateKeys(exportedData, password);

			const finalKeys = await keyManager.getUserKeys();
			expect(finalKeys.masterKey).toBe(newKeys.masterKey);
			expect(finalKeys.keyExchangeKey).toBe(newKeys.keyExchangeKey);
			expect(finalKeys.masterKey).not.toBe(initialKeys.masterKey);
		});
	});

	describe('Security Features', () => {
		it('should use different salt for each export', async () => {
			await keyManager.generateUserKeys();
			const password = 'same-password';

			const export1 = await privateKeyManager.exportPrivateKeys(password);
			const export2 = await privateKeyManager.exportPrivateKeys(password);

			const parsed1 = JSON.parse(export1);
			const parsed2 = JSON.parse(export2);

			expect(parsed1.salt).not.toBe(parsed2.salt);
		});

		it('should use different nonce for each export', async () => {
			await keyManager.generateUserKeys();
			const password = 'same-password';

			const export1 = await privateKeyManager.exportPrivateKeys(password);
			const export2 = await privateKeyManager.exportPrivateKeys(password);

			const parsed1 = JSON.parse(export1);
			const parsed2 = JSON.parse(export2);

			expect(parsed1.nonce).not.toBe(parsed2.nonce);
		});

		it('should include timestamp in export', async () => {
			await keyManager.generateUserKeys();
			const beforeExport = Date.now();
			
			const exportedData = await privateKeyManager.exportPrivateKeys('password');
			const afterExport = Date.now();
			
			const parsed = JSON.parse(exportedData);
			expect(parsed.timestamp).toBeGreaterThanOrEqual(beforeExport);
			expect(parsed.timestamp).toBeLessThanOrEqual(afterExport);
		});
	});

	describe('Edge Cases', () => {
		it('should handle very long passwords', async () => {
			await keyManager.generateUserKeys();
			const longPassword = 'a'.repeat(1000);

			const exportedData = await privateKeyManager.exportPrivateKeys(longPassword);
			await keyManager.clearUserKeys();
			
			// Should import successfully
			await privateKeyManager.importPrivateKeys(exportedData, longPassword);
			expect(await keyManager.hasUserKeys()).toBe(true);
		});

		it('should handle passwords with special characters', async () => {
			await keyManager.generateUserKeys();
			const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?`~"\'\\';

			const exportedData = await privateKeyManager.exportPrivateKeys(specialPassword);
			await keyManager.clearUserKeys();
			
			// Should import successfully
			await privateKeyManager.importPrivateKeys(exportedData, specialPassword);
			expect(await keyManager.hasUserKeys()).toBe(true);
		});

		it('should handle unicode passwords', async () => {
			await keyManager.generateUserKeys();
			const unicodePassword = '密码测试🔐🗝️';

			const exportedData = await privateKeyManager.exportPrivateKeys(unicodePassword);
			await keyManager.clearUserKeys();
			
			// Should import successfully
			await privateKeyManager.importPrivateKeys(exportedData, unicodePassword);
			expect(await keyManager.hasUserKeys()).toBe(true);
		});
	});
});