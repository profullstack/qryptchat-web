/**
 * @fileoverview Post-Quantum Private Key Import/Export Manager for QryptChat
 * Handles secure import and export of user post-quantum private keys with password protection
 * Uses ML-KEM-1024 for quantum-resistant key management
 */

import { browser } from '$app/environment';
import { Base64, HKDF, SecureRandom, CryptoUtils } from './index.js';
import { postQuantumEncryption } from './post-quantum-encryption.js';
import * as openpgp from 'openpgp';

/**
 * Export format version for compatibility
 */
const EXPORT_VERSION = '2.0'; // Updated for post-quantum encryption

/**
 * Private key import/export manager
 */
export class PrivateKeyManager {
	/**
	 * Export user post-quantum private keys as encrypted JSON
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

		try {
			// Initialize post-quantum encryption service
			await postQuantumEncryption.initialize();

			// Get user post-quantum keys (both ML-KEM-1024 and ML-KEM-768)
			const allKeys = await postQuantumEncryption.exportUserKeys();
			if (!allKeys) {
				throw new Error('No post-quantum keys found to export');
			}

			// Prepare both key sets for encryption
			const keysToExport = {
				keys1024: allKeys.keys1024,
				keys768: allKeys.keys768,
				timestamp: Date.now(),
				version: EXPORT_VERSION
			};

			// Convert to JSON bytes
			const keysJson = JSON.stringify(keysToExport);
			const keysBytes = new TextEncoder().encode(keysJson);

			// Generate salt and derive encryption key from password
			const salt = SecureRandom.generateSalt();
			const encryptionKey = await this._deriveKeyFromPassword(password, salt);

			// Generate IV for AES-GCM encryption
			const iv = SecureRandom.generateBytes(12); // 12 bytes for GCM

			// Import key for WebCrypto API
			const cryptoKey = await crypto.subtle.importKey(
				'raw',
				encryptionKey,
				{ name: 'AES-GCM', length: 256 },
				false,
				['encrypt']
			);

			// Encrypt the keys using AES-GCM with the password-derived key
			const encryptedBuffer = await crypto.subtle.encrypt(
				{
					name: 'AES-GCM',
					iv: iv,
				},
				cryptoKey,
				keysBytes
			);

			// Create export data structure
			const exportData = {
				version: EXPORT_VERSION,
				algorithm: 'AES-GCM-256',
				timestamp: Date.now(),
				encryptedKeys: Base64.encode(new Uint8Array(encryptedBuffer)),
				salt: Base64.encode(salt),
				iv: Base64.encode(iv)
			};

			// Clear sensitive data from memory
			CryptoUtils.secureClear(encryptionKey);
			CryptoUtils.secureClear(keysBytes);

			return JSON.stringify(exportData);

		} catch (error) {
			throw new Error(`Failed to export post-quantum private keys: ${error.message}`);
		}
	}

	/**
	 * Import user post-quantum private keys from encrypted JSON
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

			// Check version compatibility - only support secure version 2.0
			if (parsedData.version !== EXPORT_VERSION) {
				throw new Error(`Insecure or unsupported export version: ${parsedData.version}. Please export keys again with the current secure version.`);
			}

			// Initialize post-quantum encryption service
			await postQuantumEncryption.initialize();

			// Decode base64 data and ensure proper ArrayBuffer backing
			const encryptedKeysBuffer = new Uint8Array(Base64.decode(parsedData.encryptedKeys));
			const salt = new Uint8Array(Base64.decode(parsedData.salt));
			const iv = new Uint8Array(Base64.decode(parsedData.iv));

			// Derive decryption key from password
			const decryptionKey = await this._deriveKeyFromPassword(password, salt);

			// Import key for WebCrypto API
			const cryptoKey = await crypto.subtle.importKey(
				'raw',
				new Uint8Array(decryptionKey),
				{ name: 'AES-GCM', length: 256 },
				false,
				['decrypt']
			);

			// Decrypt the keys using AES-GCM with the password-derived key
			let decryptedBuffer;
			try {
				decryptedBuffer = await crypto.subtle.decrypt(
					{
						name: 'AES-GCM',
						iv: iv,
					},
					cryptoKey,
					encryptedKeysBuffer
				);
			} catch (decryptError) {
				throw new Error('Invalid password or corrupted data');
			}

			// Convert decrypted buffer to JSON string
			const decryptedJson = new TextDecoder().decode(decryptedBuffer);

			// Parse decrypted keys
			const importedKeys = JSON.parse(decryptedJson);

			// Validate imported keys structure
			this._validateImportedKeys(importedKeys);

			// Clear existing keys and import new ones
			await postQuantumEncryption.clearUserKeys();
			
			// Import the ML-KEM-1024 keys
			if (importedKeys.keys1024) {
				await postQuantumEncryption.importUserKeys(
					importedKeys.keys1024.publicKey,
					importedKeys.keys1024.privateKey,
					importedKeys.keys1024.algorithm
				);
			} else if (importedKeys.publicKey) {
				// Handle legacy format (single key set)
				await postQuantumEncryption.importUserKeys(
					importedKeys.publicKey,
					importedKeys.privateKey,
					importedKeys.algorithm || 'ML-KEM-1024'
				);
			}
			
			// Import the ML-KEM-768 keys if available
			if (importedKeys.keys768) {
				await postQuantumEncryption.importUserKeys(
					importedKeys.keys768.publicKey,
					importedKeys.keys768.privateKey,
					importedKeys.keys768.algorithm
				);
			}

			// Clear sensitive data from memory
			CryptoUtils.secureClear(decryptionKey);

			console.log('🔑 Post-quantum private keys imported successfully');

		} catch (error) {
			throw new Error(`Failed to import post-quantum private keys: ${error instanceof Error ? error.message : String(error)}`);
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
			'PostQuantumKeyExport',
			32 // 256-bit key for additional security
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
		const requiredFields = ['version', 'timestamp', 'encryptedKeys', 'salt', 'algorithm', 'iv'];
		
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
		if (typeof data.algorithm !== 'string') {
			throw new Error('Invalid export format: algorithm must be a string');
		}
		if (typeof data.iv !== 'string') {
			throw new Error('Invalid export format: iv must be a string');
		}

		// Validate that we only support the secure AES-GCM format
		if (data.algorithm !== 'AES-GCM-256') {
			throw new Error(`Unsupported or insecure algorithm: ${data.algorithm}. Only AES-GCM-256 is supported.`);
		}

		// Reject any exports that contain insecure tempPrivateKey
		if (data.hasOwnProperty('tempPrivateKey')) {
			throw new Error('Insecure export format detected. Please re-export your keys with the current secure version.');
		}
	}

	/**
	 * Validate imported post-quantum keys structure
	 * @param {Object} keys - Decrypted keys object
	 * @throws {Error} If keys are invalid
	 * @private
	 */
	_validateImportedKeys(keys) {
		// Support both new format (keys1024/keys768) and legacy format (publicKey/privateKey)
		if (keys.keys1024 || keys.keys768) {
			// New format with separate key sets
			if (keys.keys1024) {
				this._validateSingleKeySet(keys.keys1024);
			}
			if (keys.keys768) {
				this._validateSingleKeySet(keys.keys768);
			}
		} else if (keys.publicKey) {
			// Legacy format with single key set
			this._validateSingleKeySet(keys);
		} else {
			throw new Error('Invalid keys format: no valid key sets found');
		}
	}
	
	/**
	 * Validate a single key set
	 * @param {Object} keySet - Single key set object
	 * @throws {Error} If key set is invalid
	 * @private
	 */
	_validateSingleKeySet(keySet) {
		const requiredFields = ['publicKey', 'privateKey', 'algorithm'];
		
		for (const field of requiredFields) {
			if (!keySet.hasOwnProperty(field)) {
				throw new Error(`Invalid key set format: missing ${field}`);
			}
		}

		// Validate field types
		if (typeof keySet.publicKey !== 'string') {
			throw new Error('Invalid key set format: publicKey must be a string');
		}
		if (typeof keySet.privateKey !== 'string') {
			throw new Error('Invalid key set format: privateKey must be a string');
		}
		if (typeof keySet.algorithm !== 'string') {
			throw new Error('Invalid key set format: algorithm must be a string');
		}

		// Validate algorithm
		if (keySet.algorithm !== 'ML-KEM-1024' && keySet.algorithm !== 'ML-KEM-768') {
			throw new Error(`Unsupported algorithm: ${keySet.algorithm}`);
		}

		// Validate base64 format by attempting to decode
		try {
			Base64.decode(keySet.publicKey);
			Base64.decode(keySet.privateKey);
		} catch (decodeError) {
			throw new Error('Invalid key set format: keys must be valid base64');
		}
	}

	/**
	 * Generate a secure filename for post-quantum key export
	 * @returns {string} Filename with timestamp
	 */
	generateExportFilename() {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		return `qryptchat-pq-keys-${timestamp}.json`;
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
			throw new Error(`Failed to export private keys with GPG: ${error instanceof Error ? error.message : String(error)}`);
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
			throw new Error(`Failed to import private keys from GPG: ${error instanceof Error ? error.message : String(error)}`);
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
			throw new Error(`GPG encryption failed: ${error instanceof Error ? error.message : String(error)}`);
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
			throw new Error(`GPG decryption failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Generate a secure filename for GPG encrypted post-quantum key export
	 * @returns {string} Filename with timestamp and .gpg extension
	 */
	generateGPGExportFilename() {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		return `qryptchat-pq-keys-${timestamp}.json.gpg`;
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