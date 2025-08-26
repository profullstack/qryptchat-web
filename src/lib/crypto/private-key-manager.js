/**
 * @fileoverview Private Key Import/Export Manager for QryptChat
 * Handles secure import and export of user private keys with password protection
 */

import { browser } from '$app/environment';
import { Base64, ChaCha20Poly1305, HKDF, SecureRandom, CryptoUtils } from './index.js';
import { keyManager } from './key-manager.js';
import * as openpgp from 'openpgp';

/**
 * Export format version for compatibility
 */
const EXPORT_VERSION = '1.0';

/**
 * Private key import/export manager
 */
export class PrivateKeyManager {
	/**
	 * Export user private keys as encrypted JSON
	 * @param {string} password - Password to encrypt the keys
	 * @returns {Promise<string>} Encrypted JSON string containing the keys
	 * @throws {Error} If no user keys exist or password is invalid
	 */
	async exportPrivateKeys(password) {
		if (!password || password.trim().length === 0) {
			throw new Error('Password is required for key export');
		}

		if (!browser) {
			throw new Error('Key export is only available in browser environment');
		}

		// Check if user has keys
		const hasKeys = await keyManager.hasUserKeys();
		if (!hasKeys) {
			throw new Error('No user keys found to export');
		}

		try {
			// Get user keys
			const userKeys = await keyManager.getUserKeys();
			if (!userKeys) {
				throw new Error('No user keys found to export');
			}

			// Prepare keys for encryption
			const keysToExport = {
				masterKey: userKeys.masterKey,
				keyExchangeKey: userKeys.keyExchangeKey,
				timestamp: userKeys.timestamp,
				version: userKeys.version
			};

			// Convert to JSON bytes
			const keysJson = JSON.stringify(keysToExport);
			const keysBytes = new TextEncoder().encode(keysJson);

			// Generate salt and derive encryption key from password
			const salt = SecureRandom.generateSalt();
			const encryptionKey = await this._deriveKeyFromPassword(password, salt);

			// Generate nonce for encryption
			const nonce = SecureRandom.generateNonce();

			// Encrypt the keys
			const encryptedKeys = await ChaCha20Poly1305.encrypt(
				encryptionKey,
				nonce,
				keysBytes
			);

			// Create export data structure
			const exportData = {
				version: EXPORT_VERSION,
				timestamp: Date.now(),
				encryptedKeys: Base64.encode(encryptedKeys),
				salt: Base64.encode(salt),
				nonce: Base64.encode(nonce)
			};

			// Clear sensitive data from memory
			CryptoUtils.secureClear(encryptionKey);
			CryptoUtils.secureClear(keysBytes);

			return JSON.stringify(exportData);

		} catch (error) {
			throw new Error(`Failed to export private keys: ${error.message}`);
		}
	}

	/**
	 * Import user private keys from encrypted JSON
	 * @param {string} exportedData - Encrypted JSON string containing the keys
	 * @param {string} password - Password to decrypt the keys
	 * @returns {Promise<void>}
	 * @throws {Error} If import fails due to invalid data or wrong password
	 */
	async importPrivateKeys(exportedData, password) {
		if (!password || password.trim().length === 0) {
			throw new Error('Password is required for key import');
		}

		if (!browser) {
			throw new Error('Key import is only available in browser environment');
		}

		try {
			// Parse export data
			let parsedData;
			try {
				parsedData = JSON.parse(exportedData);
			} catch (parseError) {
				throw new Error('Invalid export format: not valid JSON');
			}

			// Validate export data structure
			this._validateExportData(parsedData);

			// Check version compatibility
			if (parsedData.version !== EXPORT_VERSION) {
				throw new Error(`Unsupported export version: ${parsedData.version}`);
			}

			// Decode base64 data
			const encryptedKeys = Base64.decode(parsedData.encryptedKeys);
			const salt = Base64.decode(parsedData.salt);
			const nonce = Base64.decode(parsedData.nonce);

			// Derive decryption key from password
			const decryptionKey = await this._deriveKeyFromPassword(password, salt);

			// Decrypt the keys
			let decryptedBytes;
			try {
				decryptedBytes = await ChaCha20Poly1305.decrypt(
					decryptionKey,
					nonce,
					encryptedKeys
				);
			} catch (decryptError) {
				throw new Error('Invalid password or corrupted data');
			}

			// Parse decrypted keys
			const decryptedJson = new TextDecoder().decode(decryptedBytes);
			const importedKeys = JSON.parse(decryptedJson);

			// Validate imported keys structure
			this._validateImportedKeys(importedKeys);

			// Clear existing keys and store imported keys
			await keyManager.clearUserKeys();
			
			// Store the imported keys in the same format as generateUserKeys
			const userKeys = {
				masterKey: importedKeys.masterKey,
				keyExchangeKey: importedKeys.keyExchangeKey,
				timestamp: importedKeys.timestamp || Date.now(),
				version: importedKeys.version || '1.0'
			};

			localStorage.setItem('qryptchat_user_keys', JSON.stringify(userKeys));

			// Clear sensitive data from memory
			CryptoUtils.secureClear(decryptionKey);
			CryptoUtils.secureClear(decryptedBytes);

			console.log('🔑 Private keys imported successfully');

		} catch (error) {
			throw new Error(`Failed to import private keys: ${error.message}`);
		}
	}

	/**
	 * Derive encryption key from password using HKDF
	 * @param {string} password - User password
	 * @param {Uint8Array} salt - Random salt
	 * @returns {Promise<Uint8Array>} Derived key
	 * @private
	 */
	async _deriveKeyFromPassword(password, salt) {
		// Convert password to bytes
		const passwordBytes = new TextEncoder().encode(password);
		
		// Use HKDF to derive a strong key from the password
		const derivedKey = await HKDF.derive(
			passwordBytes,
			salt,
			'PrivateKeyExport',
			32 // 256-bit key for ChaCha20-Poly1305
		);

		// Clear password bytes from memory
		CryptoUtils.secureClear(passwordBytes);

		return derivedKey;
	}

	/**
	 * Validate export data structure
	 * @param {Object} data - Parsed export data
	 * @throws {Error} If data is invalid
	 * @private
	 */
	_validateExportData(data) {
		const requiredFields = ['version', 'timestamp', 'encryptedKeys', 'salt', 'nonce'];
		
		for (const field of requiredFields) {
			if (!data.hasOwnProperty(field)) {
				throw new Error(`Invalid export format: missing ${field}`);
			}
		}

		// Validate field types
		if (typeof data.version !== 'string') {
			throw new Error('Invalid export format: version must be a string');
		}
		if (typeof data.timestamp !== 'number') {
			throw new Error('Invalid export format: timestamp must be a number');
		}
		if (typeof data.encryptedKeys !== 'string') {
			throw new Error('Invalid export format: encryptedKeys must be a string');
		}
		if (typeof data.salt !== 'string') {
			throw new Error('Invalid export format: salt must be a string');
		}
		if (typeof data.nonce !== 'string') {
			throw new Error('Invalid export format: nonce must be a string');
		}
	}

	/**
	 * Validate imported keys structure
	 * @param {Object} keys - Decrypted keys object
	 * @throws {Error} If keys are invalid
	 * @private
	 */
	_validateImportedKeys(keys) {
		const requiredFields = ['masterKey', 'keyExchangeKey'];
		
		for (const field of requiredFields) {
			if (!keys.hasOwnProperty(field)) {
				throw new Error(`Invalid keys format: missing ${field}`);
			}
		}

		// Validate field types
		if (typeof keys.masterKey !== 'string') {
			throw new Error('Invalid keys format: masterKey must be a string');
		}
		if (typeof keys.keyExchangeKey !== 'string') {
			throw new Error('Invalid keys format: keyExchangeKey must be a string');
		}

		// Validate base64 format by attempting to decode
		try {
			Base64.decode(keys.masterKey);
			Base64.decode(keys.keyExchangeKey);
		} catch (decodeError) {
			throw new Error('Invalid keys format: keys must be valid base64');
		}
	}

	/**
	 * Generate a secure filename for key export
	 * @returns {string} Filename with timestamp
	 */
	generateExportFilename() {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		return `qryptchat-keys-${timestamp}.json`;
	}

	/**
	 * Check if browser supports file download
	 * @returns {boolean} Whether file download is supported
	 */
	supportsFileDownload() {
		return browser && typeof document !== 'undefined' && 'createElement' in document;
	}

	/**
	 * Trigger download of exported keys
	 * @param {string} exportedData - Encrypted JSON string
	 * @param {string|null} filename - Optional filename
	 */
	downloadExportedKeys(exportedData, filename = null) {
		if (!this.supportsFileDownload()) {
			throw new Error('File download not supported in this environment');
		}

		const blob = new Blob([exportedData], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		
		const link = document.createElement('a');
		link.href = url;
		link.download = filename || this.generateExportFilename();
		
		// Trigger download
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		
		// Clean up
		URL.revokeObjectURL(url);
	}

	/**
	 * Export user private keys with GPG encryption
	 * @param {string} password - Password to encrypt the keys
	 * @param {string} gpgPassword - Password for GPG encryption
	 * @returns {Promise<string>} GPG encrypted data containing the keys
	 * @throws {Error} If no user keys exist or password is invalid
	 */
	async exportPrivateKeysWithGPG(password, gpgPassword) {
		if (!password || password.trim().length === 0) {
			throw new Error('Password is required for key export');
		}

		if (!gpgPassword || gpgPassword.trim().length === 0) {
			throw new Error('GPG password is required for GPG encryption');
		}

		try {
			// First, export keys using the standard method
			const exportedData = await this.exportPrivateKeys(password);

			// Encrypt the exported data with GPG
			const gpgEncryptedData = await this._encryptWithGPG(exportedData, gpgPassword);

			return gpgEncryptedData;

		} catch (error) {
			throw new Error(`Failed to export private keys with GPG: ${error.message}`);
		}
	}

	/**
	 * Import user private keys from GPG encrypted data
	 * @param {string} gpgEncryptedData - GPG encrypted data containing the keys
	 * @param {string} password - Password to decrypt the keys
	 * @param {string} gpgPassword - Password for GPG decryption
	 * @returns {Promise<void>}
	 * @throws {Error} If import fails due to invalid data or wrong password
	 */
	async importPrivateKeysFromGPG(gpgEncryptedData, password, gpgPassword) {
		if (!password || password.trim().length === 0) {
			throw new Error('Password is required for key import');
		}

		if (!gpgPassword || gpgPassword.trim().length === 0) {
			throw new Error('GPG password is required for GPG decryption');
		}

		try {
			// First, decrypt the GPG encrypted data
			const exportedData = await this._decryptWithGPG(gpgEncryptedData, gpgPassword);

			// Then import using the standard method
			await this.importPrivateKeys(exportedData, password);

		} catch (error) {
			throw new Error(`Failed to import private keys from GPG: ${error.message}`);
		}
	}

	/**
	 * Encrypt data using GPG with password
	 * @param {string} data - Data to encrypt
	 * @param {string} password - Password for encryption
	 * @returns {Promise<string>} GPG encrypted data
	 * @private
	 */
	async _encryptWithGPG(data, password) {
		try {
			// Create a message from the data
			const message = await openpgp.createMessage({ text: data });

			// Encrypt with password (symmetric encryption)
			const encrypted = await openpgp.encrypt({
				message,
				passwords: [password],
				config: { preferredCompressionAlgorithm: openpgp.enums.compression.zlib }
			});

			return encrypted;

		} catch (error) {
			throw new Error(`GPG encryption failed: ${error.message}`);
		}
	}

	/**
	 * Decrypt GPG encrypted data using password
	 * @param {string} encryptedData - GPG encrypted data
	 * @param {string} password - Password for decryption
	 * @returns {Promise<string>} Decrypted data
	 * @private
	 */
	async _decryptWithGPG(encryptedData, password) {
		try {
			// Read the encrypted message
			const message = await openpgp.readMessage({
				armoredMessage: encryptedData
			});

			// Decrypt with password
			const { data: decrypted } = await openpgp.decrypt({
				message,
				passwords: [password]
			});

			return decrypted;

		} catch (error) {
			throw new Error(`GPG decryption failed: ${error.message}`);
		}
	}

	/**
	 * Generate a secure filename for GPG encrypted key export
	 * @returns {string} Filename with timestamp and .gpg extension
	 */
	generateGPGExportFilename() {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		return `qryptchat-keys-${timestamp}.json.gpg`;
	}

	/**
	 * Trigger download of GPG encrypted keys
	 * @param {string} gpgEncryptedData - GPG encrypted data
	 * @param {string|null} filename - Optional filename
	 */
	downloadGPGEncryptedKeys(gpgEncryptedData, filename = null) {
		if (!this.supportsFileDownload()) {
			throw new Error('File download not supported in this environment');
		}

		const blob = new Blob([gpgEncryptedData], { type: 'application/pgp-encrypted' });
		const url = URL.createObjectURL(blob);
		
		const link = document.createElement('a');
		link.href = url;
		link.download = filename || this.generateGPGExportFilename();
		
		// Trigger download
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		
		// Clean up
		URL.revokeObjectURL(url);
	}
}

// Create and export singleton instance
export const privateKeyManager = new PrivateKeyManager();