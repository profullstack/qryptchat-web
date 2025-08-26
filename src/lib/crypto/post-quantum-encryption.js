/**
 * @fileoverview Post-quantum encryption service for QryptChat
 * Uses ML-KEM (Kyber) for key exchange + ChaCha20-Poly1305 for message encryption
 * This system is fully quantum-resistant according to FIPS 203 standards
 */

import { MlKem512, MlKem768, MlKem1024 } from 'mlkem';
import { Base64, ChaCha20Poly1305, SecureRandom, CryptoUtils } from './index.js';

/**
 * Post-quantum encryption service using ML-KEM + ChaCha20-Poly1305
 * This is fully quantum-resistant encryption
 */
export class PostQuantumEncryptionService {
	constructor() {
		this.userKeys = null; // { publicKey, privateKey }
		this.publicKeyCache = new Map(); // userId -> publicKey
		this.isInitialized = false;
		this.storageKey = 'qryptchat_pq_keypair';
		
		// Use ML-KEM-768 for good security/performance balance
		// ML-KEM-512: Faster, smaller keys (NIST Level 1)
		// ML-KEM-768: Balanced (NIST Level 3) - RECOMMENDED
		// ML-KEM-1024: Maximum security (NIST Level 5)
		this.kemAlgorithm = new MlKem768();
		this.kemName = 'ML-KEM-768';
	}

	/**
	 * Initialize the encryption service
	 */
	async initialize() {
		if (typeof window !== 'undefined') {
			await this.loadUserKeys();
		}
		this.isInitialized = true;
		console.log(`🔐 Post-quantum encryption service initialized (${this.kemName})`);
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

			// Store in localStorage
			if (typeof window !== 'undefined') {
				const keyData = {
					publicKey,
					privateKey,
					algorithm: this.kemName,
					timestamp: Date.now(),
					version: '3.0' // Post-quantum version
				};
				localStorage.setItem(this.storageKey, JSON.stringify(keyData));
			}

			console.log(`🔐 Generated new ${this.kemName} key pair`);
			return this.userKeys;

		} catch (error) {
			console.error('🔐 Failed to generate post-quantum keys:', error);
			throw error;
		}
	}

	/**
	 * Load user keys from storage
	 * @private
	 */
	async loadUserKeys() {
		try {
			if (typeof window === 'undefined') return;

			const stored = localStorage.getItem(this.storageKey);
			if (!stored) return;

			const keyData = JSON.parse(stored);
			
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

			console.log(`🔐 Encrypting message using ${this.kemName}...`);

			// Decode recipient's public key
			const recipientPubKeyBytes = Base64.decode(recipientPublicKey);

			// Encapsulate a shared secret using ML-KEM
			const [kemCiphertext, sharedSecret] = await this.kemAlgorithm.encap(recipientPubKeyBytes);

			// Use the shared secret as ChaCha20-Poly1305 key (first 32 bytes)
			const chachaKey = sharedSecret.slice(0, 32);

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
				alg: this.kemName, // Algorithm identifier
				kem: Base64.encode(kemCiphertext), // KEM ciphertext
				n: Base64.encode(nonce), // Nonce
				c: Base64.encode(messageCiphertext), // Message ciphertext
				t: Date.now() // Timestamp
			};

			// Clear sensitive data
			CryptoUtils.secureClear(chachaKey);
			CryptoUtils.secureClear(sharedSecret);

			const result = JSON.stringify(encryptedMessage);
			console.log(`🔐 ✅ Encrypted message using ${this.kemName}`);
			return result;

		} catch (error) {
			console.error(`🔐 ❌ Failed to encrypt message with ${this.kemName}:`, error);
			throw error;
		}
	}

	/**
	 * Decrypt message from a sender using post-quantum cryptography
	 * @param {string} encryptedContent - Encrypted message content (JSON string)
	 * @param {string} senderPublicKey - Sender's public key (base64) - not used in KEM but kept for API compatibility
	 * @returns {Promise<string>} Decrypted message text
	 */
	async decryptFromSender(encryptedContent, senderPublicKey) {
		try {
			if (!this.isInitialized) {
				throw new Error('Post-quantum encryption service not initialized');
			}

			console.log(`🔐 Decrypting message using ${this.kemName}...`);

			// Parse encrypted message
			let messageData;
			try {
				messageData = JSON.parse(encryptedContent);
			} catch (parseError) {
				// If it's not JSON, it might be plain text or legacy format
				console.log('🔐 Content is not post-quantum encrypted format, returning as is');
				return encryptedContent;
			}

			// Check if it's our post-quantum encrypted format
			if (!messageData.v || messageData.v !== 3 || !messageData.alg || !messageData.kem || !messageData.n || !messageData.c) {
				console.log('🔐 Content is not post-quantum encrypted format, returning as is');
				return encryptedContent;
			}

			// Verify algorithm compatibility
			if (messageData.alg !== this.kemName) {
				throw new Error(`Algorithm mismatch: message uses ${messageData.alg}, but we use ${this.kemName}`);
			}

			const userKeys = await this.getUserKeys();

			// Decode our private key and KEM ciphertext
			const privateKeyBytes = Base64.decode(userKeys.privateKey);
			const kemCiphertext = Base64.decode(messageData.kem);

			// Decapsulate the shared secret using ML-KEM
			const sharedSecret = await this.kemAlgorithm.decap(kemCiphertext, privateKeyBytes);

			// Use the shared secret as ChaCha20-Poly1305 key (first 32 bytes)
			const chachaKey = sharedSecret.slice(0, 32);

			// Decrypt message with ChaCha20-Poly1305
			const nonce = Base64.decode(messageData.n);
			const messageCiphertext = Base64.decode(messageData.c);
			
			const plaintext = await ChaCha20Poly1305.decrypt(
				chachaKey,
				nonce,
				messageCiphertext
			);

			const messageText = new TextDecoder().decode(plaintext);
			
			// Clear sensitive data
			CryptoUtils.secureClear(chachaKey);
			CryptoUtils.secureClear(sharedSecret);

			console.log(`🔐 ✅ Successfully decrypted message using ${this.kemName}: "${messageText}"`);
			return messageText;

		} catch (error) {
			console.error(`🔐 ❌ Failed to decrypt message with ${this.kemName}:`, error);
			return '[Encrypted message - decryption failed]';
		}
	}

	/**
	 * Clear all user keys
	 */
	async clearUserKeys() {
		// Clear memory
		this.userKeys = null;
		this.publicKeyCache.clear();

		// Clear localStorage
		if (typeof window !== 'undefined') {
			localStorage.removeItem(this.storageKey);
		}

		console.log(`🔐 Cleared all ${this.kemName} keys`);
	}

	/**
	 * Export user keys for backup
	 * @returns {Promise<{publicKey: string, privateKey: string, algorithm: string}>}
	 */
	async exportUserKeys() {
		const keys = await this.getUserKeys();
		return {
			publicKey: keys.publicKey,
			privateKey: keys.privateKey,
			algorithm: this.kemName
		};
	}

	/**
	 * Import user keys from backup
	 * @param {string} publicKey - Base64 encoded public key
	 * @param {string} privateKey - Base64 encoded private key
	 * @param {string} algorithm - Algorithm name (optional, defaults to current)
	 */
	async importUserKeys(publicKey, privateKey, algorithm = this.kemName) {
		if (algorithm !== this.kemName) {
			console.warn(`🔐 Importing keys with algorithm ${algorithm}, but current algorithm is ${this.kemName}`);
		}

		this.userKeys = { publicKey, privateKey };

		// Store in localStorage
		if (typeof window !== 'undefined') {
			const keyData = {
				publicKey,
				privateKey,
				algorithm,
				timestamp: Date.now(),
				version: '3.0'
			};
			localStorage.setItem(this.storageKey, JSON.stringify(keyData));
		}

		console.log(`🔐 Imported ${algorithm} keys`);
	}

	/**
	 * Get algorithm information
	 * @returns {Object} Algorithm details
	 */
	getAlgorithmInfo() {
		return {
			name: this.kemName,
			type: 'Post-Quantum KEM + Symmetric Encryption',
			keyExchange: this.kemName,
			encryption: 'ChaCha20-Poly1305',
			quantumResistant: true,
			securityLevel: this.kemName === 'ML-KEM-512' ? 1 : this.kemName === 'ML-KEM-768' ? 3 : 5
		};
	}
}

// Create and export singleton instance
export const postQuantumEncryption = new PostQuantumEncryptionService();