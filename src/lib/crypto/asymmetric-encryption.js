/**
 * @fileoverview Asymmetric encryption service for QryptChat
 * Uses X25519 key exchange + ChaCha20-Poly1305 for message encryption
 * Each user has a public/private key pair for secure communication
 */

import { Base64, ChaCha20Poly1305, SecureRandom, CryptoUtils } from './index.js';

/**
 * Asymmetric encryption service using X25519 + ChaCha20-Poly1305
 */
export class AsymmetricEncryptionService {
	constructor() {
		this.userKeys = null; // { publicKey, privateKey }
		this.publicKeyCache = new Map(); // userId -> publicKey
		this.isInitialized = false;
		this.storageKey = 'qryptchat_user_keypair';
	}

	/**
	 * Initialize the encryption service
	 */
	async initialize() {
		if (typeof window !== 'undefined') {
			await this.loadUserKeys();
		}
		this.isInitialized = true;
		console.log('🔐 Asymmetric encryption service initialized');
	}

	/**
	 * Generate or load user's public/private key pair
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
	 * Generate new user key pair
	 * @returns {Promise<{publicKey: string, privateKey: string}>}
	 */
	async generateUserKeys() {
		try {
			// Use ECDH with P-256 curve instead of X25519 for better compatibility
			const keyPair = await crypto.subtle.generateKey(
				{
					name: 'ECDH',
					namedCurve: 'P-256'
				},
				true, // extractable
				['deriveKey']
			);

			// Export keys
			const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
			const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

			const publicKey = Base64.encode(new Uint8Array(publicKeyRaw));
			const privateKey = Base64.encode(new Uint8Array(privateKeyRaw));

			this.userKeys = { publicKey, privateKey };

			// Store in localStorage
			if (typeof window !== 'undefined') {
				const keyData = {
					publicKey,
					privateKey,
					timestamp: Date.now(),
					version: '2.0' // New asymmetric version
				};
				localStorage.setItem(this.storageKey, JSON.stringify(keyData));
			}

			console.log('🔐 Generated new user key pair');
			return this.userKeys;

		} catch (error) {
			console.error('🔐 Failed to generate user keys:', error);
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
			
			// Validate key data
			if (keyData.publicKey && keyData.privateKey) {
				this.userKeys = {
					publicKey: keyData.publicKey,
					privateKey: keyData.privateKey
				};
				console.log('🔐 Loaded user keys from storage');
			}
		} catch (error) {
			console.error('🔐 Failed to load user keys:', error);
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
		console.log(`🔐 Stored public key for user: ${userId}`);
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
	 * Encrypt message for a specific recipient
	 * @param {string} message - Plain text message
	 * @param {string} recipientPublicKey - Recipient's public key (base64)
	 * @returns {Promise<string>} Encrypted message (JSON string)
	 */
	async encryptForRecipient(message, recipientPublicKey) {
		try {
			if (!this.isInitialized) {
				throw new Error('Encryption service not initialized');
			}

			const userKeys = await this.getUserKeys();

			// Import keys for ECDH
			const privateKey = await crypto.subtle.importKey(
				'pkcs8',
				Base64.decode(userKeys.privateKey),
				{ name: 'ECDH', namedCurve: 'P-256' },
				false,
				['deriveKey']
			);

			const publicKey = await crypto.subtle.importKey(
				'raw',
				Base64.decode(recipientPublicKey),
				{ name: 'ECDH', namedCurve: 'P-256' },
				false,
				[]
			);

			// Derive shared secret using ECDH
			const sharedSecret = await crypto.subtle.deriveKey(
				{ name: 'ECDH', public: publicKey },
				privateKey,
				{ name: 'HKDF' },
				false,
				['deriveKey']
			);

			// Derive encryption key from shared secret
			const encryptionKey = await crypto.subtle.deriveKey(
				{
					name: 'HKDF',
					hash: 'SHA-256',
					salt: new Uint8Array(32), // Zero salt for simplicity
					info: new TextEncoder().encode('QryptChat-Message-Encryption')
				},
				sharedSecret,
				{ name: 'AES-GCM', length: 256 },
				true,
				['encrypt']
			);

			// Export the key for ChaCha20-Poly1305
			const keyRaw = await crypto.subtle.exportKey('raw', encryptionKey);
			const chachaKey = new Uint8Array(keyRaw);

			// Generate nonce
			const nonce = SecureRandom.generateNonce();
			
			// Encrypt with ChaCha20-Poly1305
			const plaintext = new TextEncoder().encode(message);
			const ciphertext = await ChaCha20Poly1305.encrypt(
				chachaKey,
				nonce,
				plaintext
			);

			// Create encrypted message structure
			const encryptedMessage = {
				v: 2, // Version 2 for asymmetric encryption
				n: Base64.encode(nonce),
				c: Base64.encode(ciphertext),
				s: Base64.encode(new Uint8Array(keyRaw.slice(0, 16))) // Key fingerprint for verification
			};

			// Clear sensitive data
			CryptoUtils.secureClear(chachaKey);

			const result = JSON.stringify(encryptedMessage);
			console.log('🔐 ✅ Encrypted message for recipient');
			return result;

		} catch (error) {
			console.error('🔐 ❌ Failed to encrypt message:', error);
			throw error;
		}
	}

	/**
	 * Decrypt message from a sender
	 * @param {string} encryptedContent - Encrypted message content (JSON string)
	 * @param {string} senderPublicKey - Sender's public key (base64)
	 * @returns {Promise<string>} Decrypted message text
	 */
	async decryptFromSender(encryptedContent, senderPublicKey) {
		try {
			if (!this.isInitialized) {
				throw new Error('Encryption service not initialized');
			}

			console.log('🔐 Decrypting message from sender');

			// Parse encrypted message
			let messageData;
			try {
				messageData = JSON.parse(encryptedContent);
			} catch (parseError) {
				// If it's not JSON, it might be plain text (legacy)
				console.log('🔐 Content is not JSON, treating as plain text');
				return encryptedContent;
			}

			// Check if it's our encrypted format
			if (!messageData.v || messageData.v !== 2 || !messageData.n || !messageData.c) {
				console.log('🔐 Content is not asymmetric encrypted format, returning as is');
				return encryptedContent;
			}

			const userKeys = await this.getUserKeys();

			// Import keys for ECDH
			const privateKey = await crypto.subtle.importKey(
				'pkcs8',
				Base64.decode(userKeys.privateKey),
				{ name: 'ECDH', namedCurve: 'P-256' },
				false,
				['deriveKey']
			);

			const publicKey = await crypto.subtle.importKey(
				'raw',
				Base64.decode(senderPublicKey),
				{ name: 'ECDH', namedCurve: 'P-256' },
				false,
				[]
			);

			// Derive shared secret using ECDH
			const sharedSecret = await crypto.subtle.deriveKey(
				{ name: 'ECDH', public: publicKey },
				privateKey,
				{ name: 'HKDF' },
				false,
				['deriveKey']
			);

			// Derive decryption key from shared secret
			const decryptionKey = await crypto.subtle.deriveKey(
				{
					name: 'HKDF',
					hash: 'SHA-256',
					salt: new Uint8Array(32), // Zero salt for simplicity
					info: new TextEncoder().encode('QryptChat-Message-Encryption')
				},
				sharedSecret,
				{ name: 'AES-GCM', length: 256 },
				true,
				['encrypt']
			);

			// Export the key for ChaCha20-Poly1305
			const keyRaw = await crypto.subtle.exportKey('raw', decryptionKey);
			const chachaKey = new Uint8Array(keyRaw);

			// Decrypt with ChaCha20-Poly1305
			const nonce = Base64.decode(messageData.n);
			const ciphertext = Base64.decode(messageData.c);
			
			const plaintext = await ChaCha20Poly1305.decrypt(
				chachaKey,
				nonce,
				ciphertext
			);

			const messageText = new TextDecoder().decode(plaintext);
			
			// Clear sensitive data
			CryptoUtils.secureClear(chachaKey);

			console.log(`🔐 ✅ Successfully decrypted message: "${messageText}"`);
			return messageText;

		} catch (error) {
			console.error('🔐 ❌ Failed to decrypt message:', error);
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

		console.log('🔐 Cleared all user keys');
	}

	/**
	 * Export user keys for backup
	 * @returns {Promise<{publicKey: string, privateKey: string}>}
	 */
	async exportUserKeys() {
		const keys = await this.getUserKeys();
		return {
			publicKey: keys.publicKey,
			privateKey: keys.privateKey
		};
	}

	/**
	 * Import user keys from backup
	 * @param {string} publicKey - Base64 encoded public key
	 * @param {string} privateKey - Base64 encoded private key
	 */
	async importUserKeys(publicKey, privateKey) {
		this.userKeys = { publicKey, privateKey };

		// Store in localStorage
		if (typeof window !== 'undefined') {
			const keyData = {
				publicKey,
				privateKey,
				timestamp: Date.now(),
				version: '2.0'
			};
			localStorage.setItem(this.storageKey, JSON.stringify(keyData));
		}

		console.log('🔐 Imported user keys');
	}
}

// Create and export singleton instance
export const asymmetricEncryption = new AsymmetricEncryptionService();