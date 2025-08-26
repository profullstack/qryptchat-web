/**
 * @fileoverview Encrypted key backup system
 * Handles encryption/decryption of user keys for secure cloud storage
 */

import { browser } from '$app/environment';
import { Base64 } from './index.js';

/**
 * Encrypted key backup service
 * Encrypts user keys with master key for secure cloud storage
 */
export class EncryptedKeyBackup {
	/**
	 * Encrypt identity keys for backup
	 * @param {{ publicKey: Uint8Array, privateKey: Uint8Array }} identityKeys - Identity key pair
	 * @param {Uint8Array} masterKey - Master encryption key
	 * @returns {Promise<{ encryptedData: Uint8Array, nonce: Uint8Array }>} Encrypted key data
	 */
	static async encryptIdentityKeys(identityKeys, masterKey) {
		if (!browser) {
			throw new Error('Key encryption only available in browser');
		}

		try {
			// Serialize identity keys
			const keyData = {
				publicKey: Base64.encode(identityKeys.publicKey),
				privateKey: Base64.encode(identityKeys.privateKey),
				timestamp: Date.now()
			};

			const plaintext = new TextEncoder().encode(JSON.stringify(keyData));
			
			// Generate random nonce
			const nonce = new Uint8Array(12); // 96 bits for AES-GCM
			crypto.getRandomValues(nonce);

			// Import master key for AES-GCM
			const cryptoKey = await crypto.subtle.importKey(
				'raw',
				masterKey,
				{ name: 'AES-GCM' },
				false,
				['encrypt']
			);

			// Encrypt the key data
			const encryptedBuffer = await crypto.subtle.encrypt(
				{
					name: 'AES-GCM',
					iv: nonce
				},
				cryptoKey,
				plaintext
			);

			const encryptedData = new Uint8Array(encryptedBuffer);

			console.log('🔑 Successfully encrypted identity keys');
			return {
				encryptedData,
				nonce
			};
		} catch (error) {
			console.error('🔑 Failed to encrypt identity keys:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Identity key encryption failed: ${errorMessage}`);
		}
	}

	/**
	 * Decrypt identity keys from backup
	 * @param {{ encryptedData: Uint8Array, nonce: Uint8Array }} encryptedKeys - Encrypted key data
	 * @param {Uint8Array} masterKey - Master decryption key
	 * @returns {Promise<{ publicKey: Uint8Array, privateKey: Uint8Array }>} Decrypted identity keys
	 */
	static async decryptIdentityKeys(encryptedKeys, masterKey) {
		if (!browser) {
			throw new Error('Key decryption only available in browser');
		}

		try {
			// Import master key for AES-GCM
			const cryptoKey = await crypto.subtle.importKey(
				'raw',
				masterKey,
				{ name: 'AES-GCM' },
				false,
				['decrypt']
			);

			// Decrypt the key data
			const decryptedBuffer = await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv: encryptedKeys.nonce
				},
				cryptoKey,
				encryptedKeys.encryptedData
			);

			const decryptedText = new TextDecoder().decode(decryptedBuffer);
			const keyData = JSON.parse(decryptedText);

			// Deserialize keys
			const identityKeys = {
				publicKey: Base64.decode(keyData.publicKey),
				privateKey: Base64.decode(keyData.privateKey)
			};

			console.log('🔑 Successfully decrypted identity keys');
			return identityKeys;
		} catch (error) {
			console.error('🔑 Failed to decrypt identity keys:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Identity key decryption failed: ${errorMessage}`);
		}
	}

	/**
	 * Encrypt conversation keys for backup
	 * @param {Record<string, Uint8Array>} conversationKeys - Map of conversation ID to key
	 * @param {Uint8Array} masterKey - Master encryption key
	 * @returns {Promise<{ encryptedData: Uint8Array, nonce: Uint8Array }>} Encrypted conversation keys
	 */
	static async encryptConversationKeys(conversationKeys, masterKey) {
		if (!browser) {
			throw new Error('Key encryption only available in browser');
		}

		try {
			// Serialize conversation keys
			const serializedKeys = /** @type {Record<string, string>} */ ({});
			for (const [conversationId, key] of Object.entries(conversationKeys)) {
				serializedKeys[conversationId] = Base64.encode(key);
			}

			const keyData = {
				keys: serializedKeys,
				timestamp: Date.now()
			};

			const plaintext = new TextEncoder().encode(JSON.stringify(keyData));
			
			// Generate random nonce
			const nonce = new Uint8Array(12);
			crypto.getRandomValues(nonce);

			// Import master key for AES-GCM
			const cryptoKey = await crypto.subtle.importKey(
				'raw',
				masterKey,
				{ name: 'AES-GCM' },
				false,
				['encrypt']
			);

			// Encrypt the key data
			const encryptedBuffer = await crypto.subtle.encrypt(
				{
					name: 'AES-GCM',
					iv: nonce
				},
				cryptoKey,
				plaintext
			);

			const encryptedData = new Uint8Array(encryptedBuffer);

			console.log(`🔑 Successfully encrypted ${Object.keys(conversationKeys).length} conversation keys`);
			return {
				encryptedData,
				nonce
			};
		} catch (error) {
			console.error('🔑 Failed to encrypt conversation keys:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Conversation key encryption failed: ${errorMessage}`);
		}
	}

	/**
	 * Decrypt conversation keys from backup
	 * @param {{ encryptedData: Uint8Array, nonce: Uint8Array }} encryptedKeys - Encrypted key data
	 * @param {Uint8Array} masterKey - Master decryption key
	 * @returns {Promise<Record<string, Uint8Array>>} Decrypted conversation keys
	 */
	static async decryptConversationKeys(encryptedKeys, masterKey) {
		if (!browser) {
			throw new Error('Key decryption only available in browser');
		}

		try {
			// Import master key for AES-GCM
			const cryptoKey = await crypto.subtle.importKey(
				'raw',
				masterKey,
				{ name: 'AES-GCM' },
				false,
				['decrypt']
			);

			// Decrypt the key data
			const decryptedBuffer = await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv: encryptedKeys.nonce
				},
				cryptoKey,
				encryptedKeys.encryptedData
			);

			const decryptedText = new TextDecoder().decode(decryptedBuffer);
			const keyData = JSON.parse(decryptedText);

			// Deserialize keys
			const conversationKeys = /** @type {Record<string, Uint8Array>} */ ({});
			for (const [conversationId, encodedKey] of Object.entries(keyData.keys)) {
				conversationKeys[conversationId] = Base64.decode(encodedKey);
			}

			console.log(`🔑 Successfully decrypted ${Object.keys(conversationKeys).length} conversation keys`);
			return conversationKeys;
		} catch (error) {
			console.error('🔑 Failed to decrypt conversation keys:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Conversation key decryption failed: ${errorMessage}`);
		}
	}

	/**
	 * Create complete encrypted backup package
	 * @param {Object} params - Backup parameters
	 * @param {{ publicKey: Uint8Array, privateKey: Uint8Array }} params.identityKeys - Identity key pair
	 * @param {Record<string, Uint8Array>} params.conversationKeys - Conversation keys map
	 * @param {Uint8Array} params.masterKey - Master encryption key
	 * @param {string} params.phoneNumber - User's phone number
	 * @param {string} params.deviceFingerprint - Device identifier
	 * @returns {Promise<Object>} Complete backup package
	 */
	static async createBackup({
		identityKeys,
		conversationKeys,
		masterKey,
		phoneNumber,
		deviceFingerprint
	}) {
		try {
			// Encrypt identity keys
			const encryptedIdentityKeys = await this.encryptIdentityKeys(identityKeys, masterKey);
			
			// Encrypt conversation keys
			const encryptedConversationKeys = await this.encryptConversationKeys(conversationKeys, masterKey);

			// Generate salt for key derivation verification
			const salt = new Uint8Array(32);
			crypto.getRandomValues(salt);

			const backup = {
				// Encrypted key data
				encryptedIdentityKeys,
				encryptedConversationKeys,
				
				// Key derivation parameters
				salt,
				iterations: 100000,
				
				// Metadata
				phoneNumber,
				deviceFingerprint,
				keyVersion: 1,
				createdAt: new Date().toISOString(),
				
				// Backup integrity
				backupId: crypto.randomUUID()
			};

			console.log(`🔑 Created complete backup package for ${phoneNumber}`);
			return backup;
		} catch (error) {
			console.error('🔑 Failed to create backup package:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Backup creation failed: ${errorMessage}`);
		}
	}

	/**
	 * Restore keys from backup package
	 * @param {any} backup - Backup package
	 * @param {Uint8Array} masterKey - Master decryption key
	 * @returns {Promise<Object>} Restored keys
	 */
	static async restoreFromBackup(backup, masterKey) {
		try {
			// Decrypt identity keys
			const identityKeys = await this.decryptIdentityKeys(backup.encryptedIdentityKeys, masterKey);
			
			// Decrypt conversation keys
			const conversationKeys = await this.decryptConversationKeys(backup.encryptedConversationKeys, masterKey);

			const restored = {
				identityKeys,
				conversationKeys,
				metadata: {
					phoneNumber: backup.phoneNumber,
					deviceFingerprint: backup.deviceFingerprint,
					keyVersion: backup.keyVersion,
					createdAt: backup.createdAt,
					backupId: backup.backupId
				}
			};

			console.log(`🔑 Successfully restored backup for ${backup.phoneNumber}`);
			return restored;
		} catch (error) {
			console.error('🔑 Failed to restore from backup:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Backup restoration failed: ${errorMessage}`);
		}
	}

	/**
	 * Verify backup integrity
	 * @param {any} backup - Backup package to verify
	 * @returns {boolean} Whether backup is valid
	 */
	static verifyBackupIntegrity(backup) {
		try {
			// Check required fields
			const requiredFields = [
				'encryptedIdentityKeys',
				'encryptedConversationKeys',
				'salt',
				'iterations',
				'phoneNumber',
				'keyVersion'
			];

			for (const field of requiredFields) {
				if (!backup[field]) {
					console.error(`🔑 Missing required field: ${field}`);
					return false;
				}
			}

			// Check encrypted data structure
			if (!backup.encryptedIdentityKeys.encryptedData || !backup.encryptedIdentityKeys.nonce) {
				console.error('🔑 Invalid identity keys structure');
				return false;
			}

			if (!backup.encryptedConversationKeys.encryptedData || !backup.encryptedConversationKeys.nonce) {
				console.error('🔑 Invalid conversation keys structure');
				return false;
			}

			// Check data types
			if (!(backup.salt instanceof Uint8Array) || backup.salt.length !== 32) {
				console.error('🔑 Invalid salt');
				return false;
			}

			if (typeof backup.iterations !== 'number' || backup.iterations < 10000) {
				console.error('🔑 Invalid iterations count');
				return false;
			}

			console.log('🔑 Backup integrity verified');
			return true;
		} catch (error) {
			console.error('🔑 Backup integrity check failed:', error);
			return false;
		}
	}

	/**
	 * Generate device fingerprint
	 * @returns {Promise<string>} Device fingerprint
	 */
	static async generateDeviceFingerprint() {
		try {
			// Collect device characteristics
			const characteristics = [
				navigator.userAgent,
				navigator.language,
				screen.width + 'x' + screen.height,
				new Date().getTimezoneOffset().toString(),
				navigator.hardwareConcurrency?.toString() || '0'
			];

			const fingerprintData = characteristics.join('|');
			const fingerprintBuffer = new TextEncoder().encode(fingerprintData);
			
			// Hash to create fingerprint
			const hashBuffer = await crypto.subtle.digest('SHA-256', fingerprintBuffer);
			const hashArray = new Uint8Array(hashBuffer);
			
			// Convert to hex string
			const fingerprint = Array.from(hashArray)
				.map(b => b.toString(16).padStart(2, '0'))
				.join('')
				.substring(0, 16); // Use first 16 characters

			console.log('🔑 Generated device fingerprint');
			return fingerprint;
		} catch (error) {
			console.error('🔑 Failed to generate device fingerprint:', error);
			// Fallback to random string
			return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
		}
	}
}