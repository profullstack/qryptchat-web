/**
 * @fileoverview Post-quantum encryption service for QryptChat
 * Uses ML-KEM (Kyber) for key exchange + ChaCha20-Poly1305 for message encryption
 * This system is fully quantum-resistant according to FIPS 203 standards
 */

import { MlKem1024, MlKem768 } from 'mlkem';
import { Base64, ChaCha20Poly1305, SecureRandom, CryptoUtils, HKDF } from './index.js';
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
			// Load both key pairs
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
		try {
			if (!this.isInitialized) {
				throw new Error('Post-quantum encryption service not initialized');
			}

			console.log(`🔐 Encrypting message using ML-KEM-1024...`);

			// Decode recipient's public key
			const recipientPubKeyBytes = Base64.decode(recipientPublicKey);

			// Detect key size to identify ML-KEM-768 vs ML-KEM-1024 public keys
			let kemAlgorithm = this.kemAlgorithm; // Default to ML-KEM-1024
			let kemName = this.kemName; // Default to ML-KEM-1024
			
			// Debug public key size
			console.log(`🔐 [DEBUG] Recipient public key length: ${recipientPubKeyBytes.length} bytes`);
			
			if (recipientPubKeyBytes.length === this.ML_KEM_768_PUBLIC_KEY_SIZE) {
				console.log(`🔐 [COMPATIBILITY] Detected ML-KEM-768 public key, but using ML-KEM-1024 for all new messages`);
				// For maximum compatibility, convert ML-KEM-768 keys to ML-KEM-1024
				// But for now, we'll always use ML-KEM-1024 for encryption
			}
			
			// Always use ML-KEM-1024 for new messages
			kemAlgorithm = this.kemAlgorithm;
			kemName = this.kemName;

			// Encapsulate a shared secret using ML-KEM-1024
			const [kemCiphertext, sharedSecret] = await kemAlgorithm.encap(recipientPubKeyBytes);

			// Use HKDF to derive a key from the shared secret
			const salt = SecureRandom.generateSalt();
			const chachaKey = await HKDF.derive(sharedSecret, salt, 'ChaCha20-Poly1305', 32);

			// Generate nonce for ChaCha20-Poly1305
			const nonce = SecureRandom.generateNonce();
			
			// Encrypt message with ChaCha20-Poly1305
			const plaintext = new TextEncoder().encode(message);
			const messageCiphertext = await ChaCha20Poly1305.encrypt(
				chachaKey,
				nonce,
				plaintext
			);

			// Create encrypted message structure - always ML-KEM-1024 for new messages
			const encryptedMessage = {
				v: 3, // Version 3 for post-quantum encryption
				alg: kemName, // Always ML-KEM-1024 for new messages
				kem: Base64.encode(kemCiphertext), // KEM ciphertext
				s: Base64.encode(salt), // HKDF salt
				n: Base64.encode(nonce), // Nonce
				c: Base64.encode(messageCiphertext), // Message ciphertext
				t: Date.now() // Timestamp
			};

			// Clear sensitive data
			CryptoUtils.secureClear(chachaKey);
			CryptoUtils.secureClear(sharedSecret);

			const result = JSON.stringify(encryptedMessage);
			console.log(`🔐 ✅ Encrypted message using ${kemName}`);
			return result;

		} catch (error) {
			console.error(`🔐 ❌ Failed to encrypt message with ML-KEM-1024:`, error);
			throw error;
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
	 * @param {string} senderPublicKey - Sender's public key
	 * @returns {Promise<string>} Decrypted message
	 */
	async decryptFromSender(encryptedContent, senderPublicKey) {
		try {
			if (!this.isInitialized) {
				throw new Error('Post-quantum encryption service not initialized');
			}

			console.log(`🔐 [DEBUG] Starting decryption...`);
			console.log(`🔐 [DEBUG] Encrypted content type:`, typeof encryptedContent);
			console.log(`🔐 [DEBUG] Encrypted content length:`, encryptedContent?.length || 0);
			console.log(`🔐 [DEBUG] Encrypted content preview:`, encryptedContent?.substring(0, 100) || 'N/A');

			// Parse encrypted message
			let messageData;
			try {
				messageData = JSON.parse(encryptedContent);
				console.log(`🔐 [DEBUG] Successfully parsed JSON, algorithm:`, messageData.alg);
			} catch (parseError) {
				const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
				console.log('🔐 [DEBUG] Content is not JSON, parse error:', errorMessage);
				console.log('🔐 [DEBUG] Raw content that failed to parse:', encryptedContent);
				// Instead of throwing, return a user-friendly message
				return '[Encrypted message]';
			}

			// Extract key fields with fallbacks for different formats
			const version = messageData.v || messageData.version || 0;
			const algorithm = messageData.alg || messageData.algorithm || '';
			const kemCiphertextBase64 = messageData.kem || messageData.kemCiphertext || '';
			const saltBase64 = messageData.s || messageData.salt || '';
			const nonceBase64 = messageData.n || messageData.nonce || '';
			const ciphertextBase64 = messageData.c || messageData.ciphertext || '';
			
			// Select the appropriate algorithm and keys based on the message format
			let decryptionAlgorithm, userKeysToUse;
			
			if (algorithm === this.kemName) {
				// ML-KEM-1024 message - use 1024 keys
				console.log(`🔐 [DEBUG] Using ${this.kemName} for decryption`);
				decryptionAlgorithm = this.kemAlgorithm;
				userKeysToUse = await this.getUserKeys();
			}
			else if (algorithm === this.kemName768) {
				// ML-KEM-768 message - use 768 keys
				console.log(`🔐 [DEBUG] Using ${this.kemName768} for decryption`);
				decryptionAlgorithm = this.kemAlgorithm768;
				userKeysToUse = await this.getUserKeys768();
			} else {
				// For unknown formats or unspecified algorithms, do a strict check
				if (!version || version !== 3 ||
					!kemCiphertextBase64 || !saltBase64 || !nonceBase64 || !ciphertextBase64) {
					console.log('🔐 [DEBUG] Content is not post-quantum encrypted format, fields:', {
						version,
						algorithm,
						hasKem: !!kemCiphertextBase64,
						hasSalt: !!saltBase64,
						hasNonce: !!nonceBase64,
						hasCiphertext: !!ciphertextBase64
					});
					// Return a user-friendly message instead of throwing an exception
					return '[Encrypted message - format error]';
				}
				
				// Try ML-KEM-1024 first, then ML-KEM-768 for backward compatibility
				console.log(`🔐 [DEBUG] Unknown algorithm "${algorithm}", trying ML-KEM-1024 first, then ML-KEM-768 if needed`);
				try {
					decryptionAlgorithm = this.kemAlgorithm;
					userKeysToUse = await this.getUserKeys();

					console.log(`🔐 [DEBUG] Using keys with algorithm ${this.kemName}`);
					console.log(`🔐 [DEBUG] Public key length:`, userKeysToUse?.publicKey?.length || 0);

					// Decode our private key and KEM ciphertext
					const privateKeyBytes = Base64.decode(userKeysToUse.privateKey);
					const kemCiphertext = Base64.decode(kemCiphertextBase64);
					console.log(`🔐 [DEBUG] Decoded private key length:`, privateKeyBytes.length);
					console.log(`🔐 [DEBUG] Decoded KEM ciphertext length:`, kemCiphertext.length);

					// Decapsulate the shared secret using the selected ML-KEM algorithm
					console.log(`🔐 [DEBUG] Starting ML-KEM decapsulation with algorithm:`, this.kemName);
					const sharedSecret = await decryptionAlgorithm.decap(kemCiphertext, privateKeyBytes);
					console.log(`🔐 [DEBUG] ML-KEM decapsulation successful, shared secret length:`, sharedSecret.length);

					// If successful, set up for the rest of the function
					// (The rest of the function will use decryptionAlgorithm, userKeysToUse, sharedSecret, etc.)
				} catch (err1024) {
					console.warn(`🔐 [DEBUG] ML-KEM-1024 decryption failed, trying ML-KEM-768. Error:`, err1024);
					try {
						decryptionAlgorithm = this.kemAlgorithm768;
						userKeysToUse = await this.getUserKeys768();

						console.log(`🔐 [DEBUG] Using keys with algorithm ${this.kemName768}`);
						console.log(`🔐 [DEBUG] Public key length:`, userKeysToUse?.publicKey?.length || 0);

						// Decode our private key and KEM ciphertext
						const privateKeyBytes = Base64.decode(userKeysToUse.privateKey);
						const kemCiphertext = Base64.decode(kemCiphertextBase64);
						console.log(`🔐 [DEBUG] Decoded private key length:`, privateKeyBytes.length);
						console.log(`🔐 [DEBUG] Decoded KEM ciphertext length:`, kemCiphertext.length);

						// Decapsulate the shared secret using the selected ML-KEM algorithm
						console.log(`🔐 [DEBUG] Starting ML-KEM decapsulation with algorithm:`, this.kemName768);
						const sharedSecret = await decryptionAlgorithm.decap(kemCiphertext, privateKeyBytes);
						console.log(`🔐 [DEBUG] ML-KEM decapsulation successful, shared secret length:`, sharedSecret.length);

						// If successful, set up for the rest of the function
						// (The rest of the function will use decryptionAlgorithm, userKeysToUse, sharedSecret, etc.)
					} catch (err768) {
						console.error(`🔐 [DEBUG] ML-KEM-768 decryption also failed. Error:`, err768);
						return '[Encrypted message - could not decrypt with any supported algorithm]';
					}
				}
			}

			console.log(`🔐 [DEBUG] Using keys with algorithm ${userKeysToUse ? (algorithm === this.kemName768 ? this.kemName768 : this.kemName) : 'unknown'}`);
			console.log(`🔐 [DEBUG] Public key length:`, userKeysToUse?.publicKey?.length || 0);

			// Decode our private key and KEM ciphertext
			const privateKeyBytes = Base64.decode(userKeysToUse.privateKey);
			const kemCiphertext = Base64.decode(kemCiphertextBase64);
			console.log(`🔐 [DEBUG] Decoded private key length:`, privateKeyBytes.length);
			console.log(`🔐 [DEBUG] Decoded KEM ciphertext length:`, kemCiphertext.length);

			// Decapsulate the shared secret using the selected ML-KEM algorithm
			console.log(`🔐 [DEBUG] Starting ML-KEM decapsulation with algorithm:`, algorithm === this.kemName768 ? this.kemName768 : this.kemName);
			const sharedSecret = await decryptionAlgorithm.decap(kemCiphertext, privateKeyBytes);
			console.log(`🔐 [DEBUG] ML-KEM decapsulation successful, shared secret length:`, sharedSecret.length);
			console.log(`🔐 [DEBUG] Shared secret (first 16 bytes):`, Array.from(sharedSecret.slice(0, 16)));

			// Use HKDF to derive a key from the shared secret
			const salt = Base64.decode(saltBase64);
			const chachaKey = await HKDF.derive(sharedSecret, salt, 'ChaCha20-Poly1305', 32);
			console.log(`🔐 [DEBUG] ChaCha key (first 16 bytes):`, Array.from(chachaKey.slice(0, 16)));

			// Decrypt message with ChaCha20-Poly1305
			const nonce = Base64.decode(nonceBase64);
			const messageCiphertext = Base64.decode(ciphertextBase64);
			console.log(`🔐 [DEBUG] Nonce length:`, nonce.length);
			console.log(`🔐 [DEBUG] Message ciphertext length:`, messageCiphertext.length);
			
			console.log(`🔐 [DEBUG] Starting ChaCha20-Poly1305 decryption...`);
			const plaintext = await ChaCha20Poly1305.decrypt(
				chachaKey,
				nonce,
				messageCiphertext
			);
			console.log(`🔐 [DEBUG] ChaCha20-Poly1305 decryption successful, plaintext length:`, plaintext.length);
			console.log(`🔐 [DEBUG] Plaintext bytes (first 20):`, Array.from(plaintext.slice(0, 20)));

			const messageText = new TextDecoder('utf-8').decode(plaintext);
			console.log(`🔐 [DEBUG] TextDecoder result:`, messageText);
			console.log(`🔐 [DEBUG] TextDecoder result length:`, messageText.length);
			console.log(`🔐 [DEBUG] TextDecoder result char codes (first 10):`, Array.from(messageText.slice(0, 10)).map(c => c.charCodeAt(0)));
			
			// Clear sensitive data
			CryptoUtils.secureClear(chachaKey);
			CryptoUtils.secureClear(sharedSecret);

			console.log(`🔐 ✅ Successfully decrypted message using ${algorithm === this.kemName768 ? this.kemName768 : this.kemName}: "${messageText}"`);
			return messageText;

		} catch (error) {
			console.error(`🔐 ❌ Failed to decrypt message with ${this.kemName}:`, error);
			if (error instanceof Error && error.stack) {
				console.error(`🔐 ❌ Error stack:`, error.stack);
			}
			
			// Check if the error is about algorithm mismatch for a more specific message
			const errorMsg = error instanceof Error ? error.message : String(error);
			if (errorMsg.includes('Algorithm mismatch')) {
				return '[Message encrypted with different keys]';
			}
			
			return '[Encrypted message - decryption failed]';
		}
	}

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
}

// Create and export singleton instance
export const postQuantumEncryption = new PostQuantumEncryptionService();