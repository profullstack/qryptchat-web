/**
 * @fileoverview Post-quantum encryption service for QryptChat
 * Uses ML-KEM (Kyber) for key exchange + ChaCha20-Poly1305 for message encryption
 * This system is fully quantum-resistant according to FIPS 203 standards
 */

import { MlKem1024, MlKem768 } from 'mlkem';
import { decrypt as decryptEnvelope, encrypt as encryptEnvelope } from '@profullstack/encrypt';
import { Base64 } from './index.js';
import { indexedDBManager } from './indexed-db-manager.js';

/**
 * Post-quantum encryption service using ML-KEM + ChaCha20-Poly1305
 * This is fully quantum-resistant encryption
 */
export class PostQuantumEncryptionService {
	constructor() {
		// Main keys use ML-KEM-1024 for maximum security (NIST Level 5)
		this.userKeys = null; // { publicKey, privateKey }
		
		// Secondary keys for backward compatibility with ML-KEM-768 messages
		this.userKeys768 = null; // { publicKey, privateKey }
		
		this.publicKeyCache = new Map(); // userId -> publicKey
		this.isInitialized = false;
		this.storageKey = 'qryptchat_pq_keypair';
		this.storageKey768 = 'qryptchat_pq_keypair_768';
		
		// ML-KEM-1024 is our primary algorithm for maximum security (NIST Level 5)
		this.kemAlgorithm = new MlKem1024();
		this.kemName = 'ML-KEM-1024';
		
		// ML-KEM-768 is supported only for backward compatibility
		this.kemAlgorithm768 = new MlKem768();
		this.kemName768 = 'ML-KEM-768';
		
		// Public key size constants for algorithm detection
		this.ML_KEM_768_PUBLIC_KEY_SIZE = 1184; // bytes
		this.ML_KEM_1024_PUBLIC_KEY_SIZE = 1568; // bytes
	}

	/**
	 * Initialize the encryption service
	 */
	async initialize() {
		if (typeof window !== 'undefined') {
			// Load both key pairs from local storage
			await Promise.all([
				this.loadUserKeys(),
				this.loadUserKeys768()
			]);

			// Generate any missing key pairs
			if (!this.userKeys) {
				await this.generateUserKeys();
			}
			if (!this.userKeys768) {
				await this.generateUserKeys768();
			}
		}
		this.isInitialized = true;
		console.log(`🔐 Post-quantum encryption service initialized (${this.kemName} with ${this.kemName768} backward compatibility)`);
	}

	/**
	 * Generate or load user's post-quantum key pair
	 * @returns {Promise<{publicKey: string, privateKey: string}>}
	 */
	async getUserKeys() {
		if (this.userKeys) {
			return this.userKeys;
		}

		// Try to load from storage
		await this.loadUserKeys();
		
		if (this.userKeys) {
			return this.userKeys;
		}

		// Generate new key pair
		return await this.generateUserKeys();
	}

	/**
	 * Generate new post-quantum user key pair
	 * @returns {Promise<{publicKey: string, privateKey: string}>}
	 */
	async generateUserKeys() {
		try {
			console.log(`🔐 Generating ${this.kemName} key pair...`);
			
			// Generate ML-KEM key pair
			const keyPair = await this.kemAlgorithm.generateKeyPair();
			
			// Export keys as base64 (keyPair is [publicKey, privateKey])
			const publicKey = Base64.encode(keyPair[0]);
			const privateKey = Base64.encode(keyPair[1]);

			this.userKeys = { publicKey, privateKey };

			// Store in IndexedDB
			if (typeof window !== 'undefined') {
				const keyData = {
					publicKey,
					privateKey,
					algorithm: this.kemName,
					timestamp: Date.now(),
					version: '3.0' // Post-quantum version
				};
				await indexedDBManager.set(this.storageKey, keyData);
			}

			console.log(`🔐 Generated new ${this.kemName} key pair`);

			// Dispatch event so UI can prompt for backup
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('qryptchat:keys-generated'));
			}

			return this.userKeys;

		} catch (error) {
			console.error('🔐 Failed to generate post-quantum keys:', error);
			throw error;
		}
	}

	/**
	 * Load ML-KEM-1024 user keys from storage
	 * @private
	 */
	async loadUserKeys() {
		try {
			if (typeof window === 'undefined') return;

			const keyData = await indexedDBManager.get(this.storageKey);
			if (!keyData) return;
			
			// Validate key data and algorithm compatibility
			if (keyData.publicKey && keyData.privateKey && keyData.algorithm === this.kemName) {
				this.userKeys = {
					publicKey: keyData.publicKey,
					privateKey: keyData.privateKey
				};
				console.log(`🔐 Loaded ${this.kemName} keys from storage`);
			} else if (keyData.algorithm && keyData.algorithm !== this.kemName) {
				console.warn(`🔐 Stored keys use ${keyData.algorithm}, but current algorithm is ${this.kemName}. Keys need regeneration.`);
			}
		} catch (error) {
			console.error('🔐 Failed to load post-quantum keys:', error);
		}
	}
	
	/**
	 * Load ML-KEM-768 user keys from storage (for backward compatibility)
	 * @private
	 */
	async loadUserKeys768() {
		try {
			if (typeof window === 'undefined') return;

			const keyData = await indexedDBManager.get(this.storageKey768);
			if (!keyData) return;
			
			// Validate key data and algorithm compatibility
			if (keyData.publicKey && keyData.privateKey && keyData.algorithm === this.kemName768) {
				this.userKeys768 = {
					publicKey: keyData.publicKey,
					privateKey: keyData.privateKey
				};
				console.log(`🔐 Loaded ${this.kemName768} keys from storage (for backward compatibility)`);
			}
		} catch (error) {
			console.error('🔐 Failed to load ML-KEM-768 keys:', error);
		}
	}

	/**
	 * Get user's public key (for sharing with others)
	 * @returns {Promise<string>} Base64 encoded public key
	 */
	async getPublicKey() {
		const keys = await this.getUserKeys();
		return keys.publicKey;
	}

	/**
	 * Store another user's public key
	 * @param {string} userId - User ID
	 * @param {string} publicKey - Base64 encoded public key
	 */
	storePublicKey(userId, publicKey) {
		this.publicKeyCache.set(userId, publicKey);
		console.log(`🔐 Stored ${this.kemName} public key for user: ${userId}`);
	}

	/**
	 * Get stored public key for a user
	 * @param {string} userId - User ID
	 * @returns {string|null} Base64 encoded public key or null
	 */
	getStoredPublicKey(userId) {
		return this.publicKeyCache.get(userId) || null;
	}

	/**
	 * Encrypt message for a specific recipient using post-quantum cryptography
	 * @param {string} message - Plain text message
	 * @param {string} recipientPublicKey - Recipient's public key (base64)
	 * @returns {Promise<string>} Encrypted message (JSON string)
	 */
	async encryptForRecipient(message, recipientPublicKey) {
		if (!this.isInitialized) {
			throw new Error('Post-quantum encryption service not initialized');
		}
		if (!recipientPublicKey || typeof recipientPublicKey !== 'string') {
			throw new Error('Invalid recipient public key format');
		}
		if (!/^[A-Za-z0-9+/=]+$/.test(recipientPublicKey)) {
			throw new Error('Public key contains invalid Base64 characters');
		}

		let recipientPubKeyBytes;
		try {
			recipientPubKeyBytes = Base64.decode(recipientPublicKey);
		} catch {
			throw new Error('Failed to decode public key');
		}
		// Some stored keys carry a text header (e.g. "KYBER102"); strip it.
		recipientPubKeyBytes = this.stripKeyHeaderIfPresent(recipientPubKeyBytes);

		// Strict key size validation — no padding/trimming allowed (corrupts ML-KEM keys)
		if (recipientPubKeyBytes.length !== this.ML_KEM_1024_PUBLIC_KEY_SIZE &&
		    recipientPubKeyBytes.length !== this.ML_KEM_768_PUBLIC_KEY_SIZE) {
			throw new Error(
				`Invalid recipient public key size: ${recipientPubKeyBytes.length} bytes. ` +
				`Expected ${this.ML_KEM_1024_PUBLIC_KEY_SIZE} (ML-KEM-1024) or ${this.ML_KEM_768_PUBLIC_KEY_SIZE} (ML-KEM-768). ` +
				`Recipient may need to use Nuclear Key Reset in Settings.`
			);
		}
		if (!this.isValidPublicKey(recipientPubKeyBytes)) {
			throw new Error('Invalid public key format');
		}

		// The cipher itself (ML-KEM + HKDF-SHA-256 + ChaCha20-Poly1305, the v3
		// envelope) lives in @profullstack/encrypt; a 768 key gets ML-KEM-768.
		const algorithm = recipientPubKeyBytes.length === this.ML_KEM_768_PUBLIC_KEY_SIZE ? this.kemName768 : this.kemName;
		try {
			return await encryptEnvelope(message, recipientPubKeyBytes, { algorithm });
		} catch (error) {
			console.error('🔐 ❌ ML-KEM encryption failed:', this.analyzePublicKey(recipientPubKeyBytes));
			throw new Error(`ML-KEM encryption failed: ${error?.message ?? error}`);
		}
	}
	
	// REMOVED: encryptWithFallbackMethod was a security vulnerability — it included the AES key
	// in the message payload, providing zero actual encryption. If ML-KEM encryption fails,
	// we now throw an error instead of silently degrading to insecure "encryption".
	
	/**
		* Analyze a public key for debugging purposes
		* @param {Uint8Array} keyBytes - The public key bytes to analyze
		* @returns {Object} - Analysis information
		*/
	analyzePublicKey(keyBytes) {
		try {
			// Simple stats that don't trigger TypeScript errors
			let zeroCount = 0;
			let nonAsciiCount = 0;
			
			// Count different byte types
			for (let i = 0; i < keyBytes.length; i++) {
				if (keyBytes[i] === 0) zeroCount++;
				if (keyBytes[i] > 127) nonAsciiCount++;
			}
			
			// Create a simple analysis object
			const info = {
				length: keyBytes.length,
				format: keyBytes.length === this.ML_KEM_1024_PUBLIC_KEY_SIZE ? 'ML-KEM-1024' :
					   keyBytes.length === this.ML_KEM_768_PUBLIC_KEY_SIZE ? 'ML-KEM-768' : 'unknown',
				firstBytes: Array.from(keyBytes.slice(0, 8)),
				zeroCount,
				nonAsciiCount,
				validKey: zeroCount < 50 && keyBytes.length > 1000  // Simple validity check
			};
			
			return info;
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			return { error: errorMessage };
		}
	}

	/**
	 * Generate new ML-KEM-768 user key pair (for backward compatibility)
	 * @returns {Promise<{publicKey: string, privateKey: string}>}
	 */
	async generateUserKeys768() {
		try {
			console.log(`🔐 Generating ${this.kemName768} key pair for backward compatibility...`);
			
			// Generate ML-KEM-768 key pair
			const keyPair = await this.kemAlgorithm768.generateKeyPair();
			
			// Export keys as base64
			const publicKey = Base64.encode(keyPair[0]);
			const privateKey = Base64.encode(keyPair[1]);

			this.userKeys768 = { publicKey, privateKey };

			// Store in IndexedDB
			if (typeof window !== 'undefined') {
				const keyData = {
					publicKey,
					privateKey,
					algorithm: this.kemName768,
					timestamp: Date.now(),
					version: '3.0'
				};
				await indexedDBManager.set(this.storageKey768, keyData);
			}

			console.log(`🔐 Generated new ${this.kemName768} key pair for backward compatibility`);
			return this.userKeys768;

		} catch (error) {
			console.error('🔐 Failed to generate ML-KEM-768 keys:', error);
			throw error;
		}
	}
	
	/**
	 * Get user's ML-KEM-768 keys (for backward compatibility)
	 * @returns {Promise<{publicKey: string, privateKey: string}>}
	 */
	async getUserKeys768() {
	 if (this.userKeys768) {
	 	return this.userKeys768;
	 }

	 // Try to load from storage
	 await this.loadUserKeys768();
	 
	 if (this.userKeys768) {
	 	return this.userKeys768;
	 }

	 // Generate new key pair
	 return await this.generateUserKeys768();
	}

	/**
	 * Decrypt message from a sender
	 * @param {string} encryptedContent - Encrypted message content
	 * @param {string} senderPublicKey - Sender's public key (optional for ML-KEM)
	 * @returns {Promise<string>} Decrypted message
	 */

	/**
	 * Decrypt message from a sender
	 * @param {string} encryptedContent - Encrypted message content
	 * @param {string} senderPublicKey - Sender's public key
	 * @returns {Promise<string>} Decrypted message
	 */
	async decryptFromSender(encryptedContent, senderPublicKey) {
		try {
			if (!this.isInitialized) {
				throw new Error('Post-quantum encryption service not initialized');
			}

			let messageData;
			try {
				messageData = JSON.parse(encryptedContent);
			} catch {
				return '[Encrypted message]';
			}

			// Older writers used long field names; the envelope uses the short ones.
			const version = messageData.v || messageData.version || 0;
			const algorithm = messageData.alg || messageData.algorithm || '';
			const envelope = {
				v: version,
				kem: messageData.kem || messageData.kemCiphertext || '',
				s: messageData.s || messageData.salt || '',
				n: messageData.n || messageData.nonce || '',
				c: messageData.c || messageData.ciphertext || ''
			};

			if (algorithm === 'FALLBACK-AES-GCM' || algorithm === 'FALLBACK-AES') {
				// AES messages are no longer supported - they should be deleted
				return '[Legacy encrypted message - please delete]';
			}

			// Decrypt with one parameter set and our matching private key. The cipher
			// itself is @profullstack/encrypt's; this keeps qrypt.chat's key handling.
			const open = async (alg) => {
				const keys = alg === this.kemName768 ? await this.getUserKeys768() : await this.getUserKeys();
				const privateKeyBytes = this.stripKeyHeaderIfPresent(Base64.decode(keys.privateKey));
				const expected = alg === this.kemName768 ? 2400 : 3168;
				if (privateKeyBytes.length !== expected) {
					throw new Error(
						`Invalid private key size: expected ${expected} bytes, got ${privateKeyBytes.length}. ` +
						`Please use Nuclear Key Reset in Settings to generate new encryption keys.`
					);
				}
				return decryptEnvelope({ ...envelope, alg }, privateKeyBytes);
			};

			if (algorithm === this.kemName || algorithm === this.kemName768) {
				return await open(algorithm);
			}

			// Unknown or missing algorithm: only a complete v3 envelope is worth trying.
			if (version !== 3 || !envelope.kem || !envelope.s || !envelope.n || !envelope.c) {
				return '[Encrypted message - format error]';
			}
			try {
				return await open(this.kemName);
			} catch {
				try {
					return await open(this.kemName768);
				} catch {
					return '[Encrypted message - could not decrypt with any supported algorithm]';
				}
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`🔐 ❌ Failed to decrypt message: ${errorMsg}`);
			if (errorMsg.includes('Algorithm mismatch')) {
				return '[Message encrypted with different keys]';
			}
			return '[Encrypted message - decryption failed]';
		}
	}
	
	// REMOVED: decryptWithFallbackMethod — fallback encryption was a security vulnerability.
	// Legacy FALLBACK-AES-GCM messages are handled by returning '[Legacy encrypted message - please delete]'.

	/**
	 * Clear all user keys (both ML-KEM-1024 and ML-KEM-768)
	 */
	async clearUserKeys() {
		// Clear memory
		this.userKeys = null;
		this.userKeys768 = null;
		this.publicKeyCache.clear();

		// Clear IndexedDB
		if (typeof window !== 'undefined') {
			await Promise.all([
				indexedDBManager.delete(this.storageKey),
				indexedDBManager.delete(this.storageKey768)
			]);
		}

		console.log(`🔐 Cleared all encryption keys`);
	}

	/**
	 * Export all user keys for backup
	 * @returns {Promise<{keys1024: Object, keys768: Object}>}
	 */
	async exportUserKeys() {
		const keys1024 = await this.getUserKeys();
		const keys768 = await this.getUserKeys768();
		
		return {
			keys1024: {
				publicKey: keys1024.publicKey,
				privateKey: keys1024.privateKey,
				algorithm: this.kemName
			},
			keys768: {
				publicKey: keys768.publicKey,
				privateKey: keys768.privateKey,
				algorithm: this.kemName768
			}
		};
	}

	/**
	 * Import user keys from backup
	 * @param {string} publicKey - Base64 encoded public key
	 * @param {string} privateKey - Base64 encoded private key
	 * @param {string} algorithm - Algorithm name (optional, defaults to current)
	 */
	async importUserKeys(publicKey, privateKey, algorithm = this.kemName) {
		if (algorithm === this.kemName) {
			// Import ML-KEM-1024 keys
			this.userKeys = { publicKey, privateKey };
			
			// Store in IndexedDB
			if (typeof window !== 'undefined') {
				const keyData = {
					publicKey,
					privateKey,
					algorithm,
					timestamp: Date.now(),
					version: '3.0'
				};
				await indexedDBManager.set(this.storageKey, keyData);
			}
		}
		else if (algorithm === this.kemName768) {
			// Import ML-KEM-768 keys
			this.userKeys768 = { publicKey, privateKey };
			
			// Store in IndexedDB
			if (typeof window !== 'undefined') {
				const keyData = {
					publicKey,
					privateKey,
					algorithm,
					timestamp: Date.now(),
					version: '3.0'
				};
				await indexedDBManager.set(this.storageKey768, keyData);
			}
		}
		else {
			console.warn(`🔐 Importing keys with unknown algorithm ${algorithm}`);
		}

		console.log(`🔐 Imported ${algorithm} keys`);
	}

	/**
	 * Check if a public key is valid for ML-KEM
	 * @param {Uint8Array} publicKeyBytes - Raw public key bytes
	 * @returns {boolean} - Whether the key is valid
	 */
	isValidPublicKey(publicKeyBytes) {
		// More tolerant length check - allow for headers and variations
		// ML-KEM-1024 should be around 1568 bytes, allow +/- 32 bytes for compatibility
		// ML-KEM-768 should be around 1184 bytes, allow +/- 32 bytes for compatibility
		const is1024Size = Math.abs(publicKeyBytes.length - this.ML_KEM_1024_PUBLIC_KEY_SIZE) <= 32;
		const is768Size = Math.abs(publicKeyBytes.length - this.ML_KEM_768_PUBLIC_KEY_SIZE) <= 32;
		
		if (!is1024Size && !is768Size) {
			console.warn(`🔐 [VALIDATE] Public key has unusual length: ${publicKeyBytes.length} bytes`);
			console.warn(`🔐 [VALIDATE] Expected ~${this.ML_KEM_1024_PUBLIC_KEY_SIZE} or ~${this.ML_KEM_768_PUBLIC_KEY_SIZE} bytes`);
			// Don't return false - just warn and continue
		}
		
		// Basic structure validation - ML-KEM public keys should not have all zeros
		// or other obvious patterns that would make them invalid
		let zeroCount = 0;
		for (let i = 0; i < Math.min(50, publicKeyBytes.length); i++) {
			if (publicKeyBytes[i] === 0) {
				zeroCount++;
			}
		}
		
		// If the first 50 bytes are all or mostly zeros, likely invalid
		if (zeroCount > 40) {
			console.error(`🔐 [VALIDATE] Public key appears to be corrupted (${zeroCount} zeros in header)`);
			return false;
		}
		
		// Log success for debugging
		console.log(`🔐 [VALIDATE] Valid key detected (${publicKeyBytes.length} bytes, ${is1024Size ? 'ML-KEM-1024' : 'ML-KEM-768'} format)`);
		
		// More comprehensive validation would require deeper ML-KEM knowledge,
		// but this catches obvious corruption issues
		return true;
	}
	
	/**
		* Strip text header from key bytes if present
		* Keys may have headers like "KYBER102" that need to be removed before use
		* @param {Uint8Array} keyBytes - The raw key bytes
		* @returns {Uint8Array} - Cleaned key bytes without header
		*/
	stripKeyHeaderIfPresent(keyBytes) {
		// Check for "KYBER" header by looking at first 5 bytes
		// ASCII for "KYBER" is [75, 89, 66, 69, 82]
		if (keyBytes.length > 8 &&
			keyBytes[0] === 75 && keyBytes[1] === 89 &&
			keyBytes[2] === 66 && keyBytes[3] === 69 &&
			keyBytes[4] === 82) {
			
			console.log('🔐 [CRITICAL] Detected "KYBER" header in key - this key format cannot be repaired');
			console.log('🔐 [CRITICAL] Please use the Nuclear Key Reset in settings to generate new clean keys');
			
			// Create a new empty array that will cause encryption to fail properly
			// This is better than returning something that looks like it might work
			return new Uint8Array(this.ML_KEM_1024_PUBLIC_KEY_SIZE);
		}
		
		// No header detected, return the original bytes — strict size validation happens elsewhere
		return keyBytes;
	}
	
	/**
		* Get algorithm information
		* @returns {Object} Algorithm details including both ML-KEM variants
		*/
	getAlgorithmInfo() {
		return {
			primaryAlgorithm: {
				name: this.kemName,
				type: 'Post-Quantum KEM + Symmetric Encryption',
				keyExchange: this.kemName,
				encryption: 'ChaCha20-Poly1305',
				quantumResistant: true,
				securityLevel: 5 // ML-KEM-1024 is level 5
			},
			compatibilityAlgorithm: {
				name: this.kemName768,
				type: 'Post-Quantum KEM + Symmetric Encryption',
				keyExchange: this.kemName768,
				encryption: 'ChaCha20-Poly1305',
				quantumResistant: true,
				securityLevel: 3 // ML-KEM-768 is level 3
			},
			multiAlgorithmSupport: true
		};
	}

	/**
	 * Validate public key format for ML-KEM (public method that can be called from other services)
	 * @param {string} publicKeyBase64 - Base64 encoded public key
	 * @returns {Uint8Array|null} - Decoded key bytes if valid, null if invalid
	 */
	validatePublicKeyFormat(publicKeyBase64) {
		try {
			if (!publicKeyBase64 || typeof publicKeyBase64 !== 'string') {
				console.error('🔐 [VALIDATE] Public key is null or not a string');
				return null;
			}
			
			// Decode the base64 public key
			let keyBytes = Base64.decode(publicKeyBase64);
			
			// Strip header if present and adjust size if needed
			keyBytes = this.stripKeyHeaderIfPresent(keyBytes);
			
			// Use our existing validation method (now more tolerant)
			if (!this.isValidPublicKey(keyBytes)) {
				console.warn('🔐 [VALIDATE] Public key failed validation checks');
				return null;
			}
			
			return keyBytes;
		} catch (error) {
			console.error('🔐 [VALIDATE] Error validating public key format:', error);
			return null;
		}
	}
	
	/**
		* Validate that a key matches the exact required size
		* @param {Uint8Array} keyBytes - The key bytes to validate
		* @param {number} targetSize - The expected size in bytes
		* @param {string} keyType - Description for error messages (e.g., 'public key', 'private key')
		* @returns {Uint8Array} - The validated key bytes (unchanged)
		* @throws {Error} If key size does not match
		*/
	validateKeySize(keyBytes, targetSize, keyType = 'key') {
		if (keyBytes.length === targetSize) {
			return keyBytes;
		}
		throw new Error(
			`Invalid ML-KEM ${keyType} size: expected ${targetSize} bytes, got ${keyBytes.length} bytes. ` +
			`Please use the Nuclear Key Reset in Settings to generate new encryption keys.`
		);
	}
}

// Create and export singleton instance
export const postQuantumEncryption = new PostQuantumEncryptionService();