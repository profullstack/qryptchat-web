/**
 * @fileoverview Tests for GPG Private Key Export/Import functionality
 * Tests the GPG encryption layer for private key backup and restore
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrivateKeyManager } from '../src/lib/crypto/private-key-manager.js';
import { keyManager } from '../src/lib/crypto/key-manager.js';

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock key manager
vi.mock('../src/lib/crypto/key-manager.js', () => ({
	keyManager: {
		hasUserKeys: vi.fn(),
		getUserKeys: vi.fn(),
		clearUserKeys: vi.fn()
	}
}));

// Mock crypto utilities
vi.mock('../src/lib/crypto/index.js', () => ({
	Base64: {
		encode: vi.fn((data) => btoa(String.fromCharCode(...data))),
		decode: vi.fn((str) => new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0))))
	},
	ChaCha20Poly1305: {
		encrypt: vi.fn(async (key, nonce, data) => new Uint8Array([1, 2, 3, 4])),
		decrypt: vi.fn(async (key, nonce, data) => new TextEncoder().encode('{"masterKey":"test","keyExchangeKey":"test"}'))
	},
	HKDF: {
		derive: vi.fn(async () => new Uint8Array(32))
	},
	SecureRandom: {
		generateSalt: vi.fn(() => new Uint8Array(32)),
		generateNonce: vi.fn(() => new Uint8Array(12))
	},
	CryptoUtils: {
		secureClear: vi.fn()
	}
}));

// Mock OpenPGP
const mockOpenPGP = {
	createMessage: vi.fn(),
	encrypt: vi.fn(),
	readMessage: vi.fn(),
	decrypt: vi.fn(),
	enums: {
		compression: {
			zlib: 2
		}
	}
};

vi.mock('openpgp', () => mockOpenPGP);

describe('GPG Private Key Export/Import', () => {
	let privateKeyManager;
	const testPassword = 'testPassword123';
	const testGPGPassword = 'gpgPassword456';
	const mockUserKeys = {
		masterKey: 'dGVzdE1hc3RlcktleQ==',
		keyExchangeKey: 'dGVzdEtleUV4Y2hhbmdl',
		timestamp: Date.now(),
		version: '1.0'
	};

	beforeEach(() => {
		privateKeyManager = new PrivateKeyManager();
		vi.clearAllMocks();
		
		// Setup default mocks
		keyManager.hasUserKeys.mockResolvedValue(true);
		keyManager.getUserKeys.mockResolvedValue(mockUserKeys);
		
		// Setup OpenPGP mocks
		mockOpenPGP.createMessage.mockResolvedValue({ text: 'mock message' });
		mockOpenPGP.encrypt.mockResolvedValue('-----BEGIN PGP MESSAGE-----\nencrypted content\n-----END PGP MESSAGE-----');
		mockOpenPGP.readMessage.mockResolvedValue({ message: 'mock encrypted message' });
		mockOpenPGP.decrypt.mockResolvedValue({ data: '{"version":"1.0","timestamp":123456789,"encryptedKeys":"test","salt":"test","nonce":"test"}' });
	});

	describe('exportPrivateKeysWithGPG', () => {
		it('should export private keys with GPG encryption', async () => {
			const result = await privateKeyManager.exportPrivateKeysWithGPG(testPassword, testGPGPassword);

			expect(result).toBe('-----BEGIN PGP MESSAGE-----\nencrypted content\n-----END PGP MESSAGE-----');
			expect(keyManager.hasUserKeys).toHaveBeenCalled();
			expect(keyManager.getUserKeys).toHaveBeenCalled();
			expect(mockOpenPGP.createMessage).toHaveBeenCalled();
			expect(mockOpenPGP.encrypt).toHaveBeenCalledWith({
				message: { text: 'mock message' },
				passwords: [testGPGPassword],
				config: { preferredCompressionAlgorithm: 2 }
			});
		});

		it('should throw error if password is empty', async () => {
			await expect(privateKeyManager.exportPrivateKeysWithGPG('', testGPGPassword))
				.rejects.toThrow('Password is required for key export');
		});

		it('should throw error if GPG password is empty', async () => {
			await expect(privateKeyManager.exportPrivateKeysWithGPG(testPassword, ''))
				.rejects.toThrow('GPG password is required for GPG encryption');
		});

		it('should throw error if no user keys exist', async () => {
			keyManager.hasUserKeys.mockResolvedValue(false);

			await expect(privateKeyManager.exportPrivateKeysWithGPG(testPassword, testGPGPassword))
				.rejects.toThrow('No user keys found to export');
		});

		it('should handle GPG encryption errors', async () => {
			mockOpenPGP.encrypt.mockRejectedValue(new Error('GPG encryption failed'));

			await expect(privateKeyManager.exportPrivateKeysWithGPG(testPassword, testGPGPassword))
				.rejects.toThrow('Failed to export private keys with GPG: GPG encryption failed');
		});
	});

	describe('importPrivateKeysFromGPG', () => {
		const mockGPGData = '-----BEGIN PGP MESSAGE-----\nencrypted content\n-----END PGP MESSAGE-----';

		it('should import private keys from GPG encrypted data', async () => {
			await privateKeyManager.importPrivateKeysFromGPG(mockGPGData, testPassword, testGPGPassword);

			expect(mockOpenPGP.readMessage).toHaveBeenCalledWith({
				armoredMessage: mockGPGData
			});
			expect(mockOpenPGP.decrypt).toHaveBeenCalledWith({
				message: { message: 'mock encrypted message' },
				passwords: [testGPGPassword]
			});
			expect(keyManager.clearUserKeys).toHaveBeenCalled();
		});

		it('should throw error if password is empty', async () => {
			await expect(privateKeyManager.importPrivateKeysFromGPG(mockGPGData, '', testGPGPassword))
				.rejects.toThrow('Password is required for key import');
		});

		it('should throw error if GPG password is empty', async () => {
			await expect(privateKeyManager.importPrivateKeysFromGPG(mockGPGData, testPassword, ''))
				.rejects.toThrow('GPG password is required for GPG decryption');
		});

		it('should handle GPG decryption errors', async () => {
			mockOpenPGP.decrypt.mockRejectedValue(new Error('Invalid GPG password'));

			await expect(privateKeyManager.importPrivateKeysFromGPG(mockGPGData, testPassword, testGPGPassword))
				.rejects.toThrow('Failed to import private keys from GPG: GPG decryption failed: Invalid GPG password');
		});

		it('should handle invalid decrypted data', async () => {
			mockOpenPGP.decrypt.mockResolvedValue({ data: 'invalid json' });

			await expect(privateKeyManager.importPrivateKeysFromGPG(mockGPGData, testPassword, testGPGPassword))
				.rejects.toThrow('Failed to import private keys from GPG');
		});
	});

	describe('GPG utility methods', () => {
		it('should generate GPG export filename', () => {
			const filename = privateKeyManager.generateGPGExportFilename();
			
			expect(filename).toMatch(/^qryptchat-keys-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.json\.gpg$/);
		});

		it('should support file download for GPG encrypted keys', () => {
			expect(privateKeyManager.supportsFileDownload()).toBe(true);
		});
	});

	describe('_encryptWithGPG', () => {
		it('should encrypt data with GPG', async () => {
			const testData = 'test data to encrypt';
			
			const result = await privateKeyManager._encryptWithGPG(testData, testGPGPassword);

			expect(result).toBe('-----BEGIN PGP MESSAGE-----\nencrypted content\n-----END PGP MESSAGE-----');
			expect(mockOpenPGP.createMessage).toHaveBeenCalledWith({ text: testData });
			expect(mockOpenPGP.encrypt).toHaveBeenCalledWith({
				message: { text: 'mock message' },
				passwords: [testGPGPassword],
				config: { preferredCompressionAlgorithm: 2 }
			});
		});

		it('should handle encryption errors', async () => {
			mockOpenPGP.encrypt.mockRejectedValue(new Error('Encryption failed'));

			await expect(privateKeyManager._encryptWithGPG('test', testGPGPassword))
				.rejects.toThrow('GPG encryption failed: Encryption failed');
		});
	});

	describe('_decryptWithGPG', () => {
		const mockEncryptedData = '-----BEGIN PGP MESSAGE-----\nencrypted\n-----END PGP MESSAGE-----';

		it('should decrypt GPG encrypted data', async () => {
			const mockDecryptedData = 'decrypted data';
			mockOpenPGP.decrypt.mockResolvedValue({ data: mockDecryptedData });

			const result = await privateKeyManager._decryptWithGPG(mockEncryptedData, testGPGPassword);

			expect(result).toBe(mockDecryptedData);
			expect(mockOpenPGP.readMessage).toHaveBeenCalledWith({
				armoredMessage: mockEncryptedData
			});
			expect(mockOpenPGP.decrypt).toHaveBeenCalledWith({
				message: { message: 'mock encrypted message' },
				passwords: [testGPGPassword]
			});
		});

		it('should handle decryption errors', async () => {
			mockOpenPGP.decrypt.mockRejectedValue(new Error('Wrong password'));

			await expect(privateKeyManager._decryptWithGPG(mockEncryptedData, testGPGPassword))
				.rejects.toThrow('GPG decryption failed: Wrong password');
		});
	});

	describe('Integration with standard export/import', () => {
		it('should use standard export internally for GPG export', async () => {
			const exportSpy = vi.spyOn(privateKeyManager, 'exportPrivateKeys');
			exportSpy.mockResolvedValue('{"test":"data"}');

			await privateKeyManager.exportPrivateKeysWithGPG(testPassword, testGPGPassword);

			expect(exportSpy).toHaveBeenCalledWith(testPassword);
		});

		it('should use standard import internally for GPG import', async () => {
			const importSpy = vi.spyOn(privateKeyManager, 'importPrivateKeys');
			importSpy.mockResolvedValue(undefined);

			const mockGPGData = '-----BEGIN PGP MESSAGE-----\ntest\n-----END PGP MESSAGE-----';
			await privateKeyManager.importPrivateKeysFromGPG(mockGPGData, testPassword, testGPGPassword);

			expect(importSpy).toHaveBeenCalledWith(
				'{"version":"1.0","timestamp":123456789,"encryptedKeys":"test","salt":"test","nonce":"test"}',
				testPassword
			);
		});
	});
});