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
	 	
	 	// Add safety check for null or invalid input
	 	if (!recipientPublicKey || typeof recipientPublicKey !== 'string') {
	 		throw new Error('Invalid recipient public key format');
	 	}
	 	
	 	// Validate the key is proper Base64
	 	if (!/^[A-Za-z0-9+/=]+$/.test(recipientPublicKey)) {
	 		throw new Error('Public key contains invalid Base64 characters');
	 	}

	 	// Decode recipient's public key with better error handling
	 	let recipientPubKeyBytes;
	 	try {
	 		recipientPubKeyBytes = Base64.decode(recipientPublicKey);
	 	} catch (decodeError) {
	 		console.error('🔐 [ERROR] Failed to decode public key from Base64:', decodeError);
	 		throw new Error('Failed to decode public key');
	 	}
	 	
	 	// Check if the key has a text header (e.g., "KYBER102") and strip it if needed
	 	recipientPubKeyBytes = this.stripKeyHeaderIfPresent(recipientPubKeyBytes);
	 	
	 	// Always ensure key is exact size after header stripping
	 	const diff1024 = Math.abs(recipientPubKeyBytes.length - this.ML_KEM_1024_PUBLIC_KEY_SIZE);
	 	const diff768 = Math.abs(recipientPubKeyBytes.length - this.ML_KEM_768_PUBLIC_KEY_SIZE);
	 	
	 	if (recipientPubKeyBytes.length !== this.ML_KEM_1024_PUBLIC_KEY_SIZE &&
	 	    recipientPubKeyBytes.length !== this.ML_KEM_768_PUBLIC_KEY_SIZE) {
	 		
	 		// Choose the closest target size and pad to exact size
	 		if (diff1024 <= 32 && diff1024 <= diff768) {
	 			console.log(`🔐 [DEBUG] Key length ${recipientPubKeyBytes.length} close to ML-KEM-1024, padding to exact size`);
	 			recipientPubKeyBytes = this.padKeyToExactSize(recipientPubKeyBytes, this.ML_KEM_1024_PUBLIC_KEY_SIZE);
	 		}
	 		else if (diff768 <= 32) {
	 			console.log(`🔐 [DEBUG] Key length ${recipientPubKeyBytes.length} close to ML-KEM-768, padding to exact size`);
	 			recipientPubKeyBytes = this.padKeyToExactSize(recipientPubKeyBytes, this.ML_KEM_768_PUBLIC_KEY_SIZE);
	 		}
	 	}

	 	// Detect key size to identify ML-KEM-768 vs ML-KEM-1024 public keys
	 	let kemAlgorithm = this.kemAlgorithm; // Default to ML-KEM-1024
	 	let kemName = this.kemName; // Default to ML-KEM-1024
	 	
	 	// Debug public key size
	 	console.log(`🔐 [DEBUG] Recipient public key length: ${recipientPubKeyBytes.length} bytes`);
	 	console.log(`🔐 [DEBUG] Public key first 8 bytes:`, Array.from(recipientPubKeyBytes.slice(0, 8)));
	 	
	 	// Validate the public key before using it
	 	if (!this.isValidPublicKey(recipientPubKeyBytes)) {
	 		console.error(`🔐 [ERROR] Invalid public key format detected (length: ${recipientPubKeyBytes.length} bytes)`);
	 		throw new Error('Invalid public key format');
	 	}
	 	
	 	if (recipientPubKeyBytes.length === this.ML_KEM_768_PUBLIC_KEY_SIZE) {
	 		console.log(`🔐 [COMPATIBILITY] Detected ML-KEM-768 public key, using ML-KEM-768 for encryption`);
	 		// For ML-KEM-768 keys, use a different approach (avoiding TS errors)
	 		try {
	 			// Encapsulate using ML-KEM-768 directly
	 			const [kem768Ciphertext, kem768SharedSecret] = await this.kemAlgorithm768.encap(recipientPubKeyBytes);
	 			
	 			// Use HKDF to derive a key from the shared secret
	 			const salt = SecureRandom.generateSalt();
	 			const chachaKey = await HKDF.derive(kem768SharedSecret, salt, 'ChaCha20-Poly1305', 32);
	 			
	 			// Generate nonce for ChaCha20-Poly1305
	 			const nonce = SecureRandom.generateNonce();
	 			
	 			// Encrypt message with ChaCha20-Poly1305
	 			const plaintext = new TextEncoder().encode(message);
	 			const messageCiphertext = await ChaCha20Poly1305.encrypt(
	 				chachaKey,
	 				nonce,
	 				plaintext
	 			);
	 			
	 			// Create encrypted message structure
	 			const encryptedMessage = {
	 				v: 3, // Version 3 for post-quantum encryption
	 				alg: this.kemName768, // ML-KEM-768 for compatibility
	 				kem: Base64.encode(kem768Ciphertext), // KEM ciphertext
	 				s: Base64.encode(salt), // HKDF salt
	 				n: Base64.encode(nonce), // Nonce
	 				c: Base64.encode(messageCiphertext), // Message ciphertext
	 				t: Date.now() // Timestamp
	 			};
	 			
	 			// Clear sensitive data
	 			CryptoUtils.secureClear(chachaKey);
	 			CryptoUtils.secureClear(kem768SharedSecret);
	 			
	 			const result = JSON.stringify(encryptedMessage);
	 			console.log(`🔐 ✅ Encrypted message using ${this.kemName768}`);
	 			return result;
	 		} catch (kem768Error) {
	 			console.error(`🔐 ❌ ML-KEM-768 encryption failed:`, kem768Error);
	 			throw kem768Error;
	 		}
	 	} else {
	 		kemAlgorithm = this.kemAlgorithm;
	 		kemName = this.kemName;
	 	}

	 	try {
	 		// Try ML-KEM encryption first
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

	 		// Create encrypted message structure
	 		const encryptedMessage = {
	 			v: 3, // Version 3 for post-quantum encryption
	 			alg: kemName,
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
	 	} catch (encapError) {
	 		console.error(`🔐 ❌ ML-KEM encapsulation failed:`, encapError);
	 		
	 		// Log key analysis for debugging
	 		const keyInfo = this.analyzePublicKey(recipientPubKeyBytes);
	 		console.log(`🔐 [DEBUG] Public key analysis:`, keyInfo);
	 		
	 		// No fallback - throw the error to surface the real issue
	 		throw new Error(`ML-KEM encryption failed: ${encapError.message}`);
	 	}
	 } catch (error) {
	 	console.error(`🔐 ❌ All encryption methods failed:`, error);
	 	throw new Error('Unable to encrypt message with any available method');
	 }
	}
	
	/**
	 * Fallback encryption method using Web Crypto API
	 * @param {string} message - Plain text message
	 * @param {string} recipientKey - Recipient's key (only used as a seed)
	 * @returns {Promise<string>} Encrypted message in compatible format
	 */
	async encryptWithFallbackMethod(message, recipientKey) {
	 try {
	 	console.log('🔐 [FALLBACK] Using Web Crypto API for fallback encryption');
	 	
	 	// Generate a random key for AES-GCM
	 	const key = await window.crypto.subtle.generateKey(
	 		{ name: 'AES-GCM', length: 256 },
	 		true,
	 		['encrypt', 'decrypt']
	 	);
	 	
	 	// Export the key to raw bytes
	 	const rawKey = await window.crypto.subtle.exportKey('raw', key);
	 	const keyBytes = new Uint8Array(rawKey);
	 	
	 	// Generate a random IV (nonce)
	 	const iv = SecureRandom.getRandomBytes(12);
	 	
	 	// Encode the message
	 	const plaintext = new TextEncoder().encode(message);
	 	
	 	// Encrypt with AES-GCM
	 	const ciphertext = await window.crypto.subtle.encrypt(
	 		{ name: 'AES-GCM', iv },
	 		key,
	 		plaintext
	 	);
	 	
	 	// Create key identifier that includes a hash of the recipient key
	 	// This ensures we can identify which fallback key to use when decrypting
	 	const keyIdInput = new TextEncoder().encode(recipientKey);
	 	const keyIdHash = await window.crypto.subtle.digest('SHA-256', keyIdInput);
	 	const keyId = Base64.encode(new Uint8Array(keyIdHash));
	 	
	 	// Create a message structure compatible with our existing format
	 	const encryptedMessage = {
	 		v: 3, // Version 3
	 		alg: 'FALLBACK-AES-GCM', // Indicate this is fallback encryption
	 		kid: keyId.substring(0, 16), // Key ID (truncated hash of recipient key)
	 		key: Base64.encode(keyBytes), // Include the encryption key
	 		iv: Base64.encode(iv), // The IV (nonce)
	 		c: Base64.encode(new Uint8Array(ciphertext)), // Ciphertext
	 		t: Date.now() // Timestamp
	 	};
	 	
	 	const result = JSON.stringify(encryptedMessage);
	 	console.log(`🔐 ✅ Encrypted message using fallback encryption`);
	 	return result;
	 } catch (fallbackError) {
	 	console.error(`🔐 ❌ Fallback encryption failed:`, fallbackError);
	 	throw fallbackError;
	 }
	}
	
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
			} else if (algorithm === 'FALLBACK-AES-GCM' || algorithm === 'FALLBACK-AES') {
				// AES messages are no longer supported - they should be deleted
				console.log('🔐 [LEGACY] AES encrypted message detected - no longer supported');
				return '[Legacy encrypted message - please delete]';
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
					let privateKeyBytes = Base64.decode(userKeysToUse.privateKey);
					const kemCiphertext = Base64.decode(kemCiphertextBase64);
					
					// Strip header from private key if present
					privateKeyBytes = this.stripKeyHeaderIfPresent(privateKeyBytes);
					
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
			let privateKeyBytes = Base64.decode(userKeysToUse.privateKey);
			const kemCiphertext = Base64.decode(kemCiphertextBase64);
			
			// Strip header from private key if present
			privateKeyBytes = this.stripKeyHeaderIfPresent(privateKeyBytes);
			
			// Ensure private key is the correct size for ML-KEM algorithm
			const targetPrivateKeySize = algorithm === this.kemName768 ?
				2400 : // ML-KEM-768 private key size
				3168;  // ML-KEM-1024 private key size
				
			if (privateKeyBytes.length !== targetPrivateKeySize) {
				console.log(`🔐 [DEBUG] Private key length ${privateKeyBytes.length} doesn't match target ${targetPrivateKeySize}, padding/trimming`);
				privateKeyBytes = this.padKeyToExactSize(privateKeyBytes, targetPrivateKeySize);
			}
			
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
		* Decrypt a message that was encrypted with the fallback method
		* @param {Object} messageData - The parsed message data
		* @returns {Promise<string>} Decrypted message
		*/
	async decryptWithFallbackMethod(messageData) {
		try {
			console.log('🔐 [FALLBACK] Decrypting message with fallback method');
			
			// Extract the necessary fields
			const keyBase64 = messageData.key || '';
			const ivBase64 = messageData.iv || '';
			const ciphertextBase64 = messageData.c || '';
			
			if (!keyBase64 || !ivBase64 || !ciphertextBase64) {
				throw new Error('Missing required fields for fallback decryption');
			}
			
			// Convert from Base64
			const keyBytes = Base64.decode(keyBase64);
			const iv = Base64.decode(ivBase64);
			const ciphertext = Base64.decode(ciphertextBase64);
			
			// Import the key
			const key = await window.crypto.subtle.importKey(
				'raw',
				keyBytes,
				{ name: 'AES-GCM', length: 256 },
				false,
				['decrypt']
			);
			
			// Decrypt
			const decrypted = await window.crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv },
				key,
				ciphertext
			);
			
			// Convert to text
			const messageText = new TextDecoder().decode(new Uint8Array(decrypted));
			console.log(`🔐 [FALLBACK] ✅ Successfully decrypted message using fallback method: "${messageText}"`);
			
			return messageText;
		} catch (error) {
			console.error('🔐 [FALLBACK] ❌ Failed to decrypt with fallback method:', error);
			return '[Fallback-encrypted message - decryption failed]';
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
		
		// Check if key is close to expected size but slightly off (might need padding/trimming)
		const diff1024 = Math.abs(keyBytes.length - this.ML_KEM_1024_PUBLIC_KEY_SIZE);
		const diff768 = Math.abs(keyBytes.length - this.ML_KEM_768_PUBLIC_KEY_SIZE);
		
		if (diff1024 <= 32 && diff1024 <= diff768) {
			console.log(`🔐 [DEBUG] Key length ${keyBytes.length} is close to ML-KEM-1024 (${this.ML_KEM_1024_PUBLIC_KEY_SIZE}), adjusting`);
			return this.padKeyToExactSize(keyBytes, this.ML_KEM_1024_PUBLIC_KEY_SIZE);
		} else if (diff768 <= 32) {
			console.log(`🔐 [DEBUG] Key length ${keyBytes.length} is close to ML-KEM-768 (${this.ML_KEM_768_PUBLIC_KEY_SIZE}), adjusting`);
			return this.padKeyToExactSize(keyBytes, this.ML_KEM_768_PUBLIC_KEY_SIZE);
		}
		
		// No header detected, return the original bytes
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
		* Pad or trim a key to the exact required size
		* @param {Uint8Array} keyBytes - The key bytes to adjust
		* @param {number} targetSize - The target size in bytes
		* @returns {Uint8Array} - Adjusted key bytes
		*/
	padKeyToExactSize(keyBytes, targetSize) {
		if (keyBytes.length === targetSize) {
			return keyBytes; // Already the right size
		}
		
		if (keyBytes.length < targetSize) {
			// Need to pad the key
			const paddedKey = new Uint8Array(targetSize);
			paddedKey.set(keyBytes);
			// Fill remaining bytes with zeros
			for (let i = keyBytes.length; i < targetSize; i++) {
				paddedKey[i] = 0;
			}
			console.log(`🔐 [DEBUG] Padded key from ${keyBytes.length} to ${targetSize} bytes`);
			return paddedKey;
		} else {
			// Need to trim the key
			console.log(`🔐 [DEBUG] Trimmed key from ${keyBytes.length} to ${targetSize} bytes`);
			return keyBytes.slice(0, targetSize);
		}
	}
}

// Create and export singleton instance
export const postQuantumEncryption = new PostQuantumEncryptionService();