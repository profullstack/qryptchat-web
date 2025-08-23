/**
 * @fileoverview Post-Quantum Cryptography utilities for QryptChat
 * Implements CRYSTALS-Kyber (KEM) and CRYSTALS-Dilithium (Digital Signatures)
 * with ChaCha20-Poly1305 for symmetric encryption
 */

/**
 * Crypto configuration constants
 */
export const CRYPTO_CONFIG = {
	// CRYSTALS-Kyber configuration (Level 5 security)
	KYBER: {
		PUBLIC_KEY_SIZE: 1568,
		PRIVATE_KEY_SIZE: 3168,
		CIPHERTEXT_SIZE: 1568,
		SHARED_SECRET_SIZE: 32
	},
	
	// CRYSTALS-Dilithium configuration (Level 5 security)
	DILITHIUM: {
		PUBLIC_KEY_SIZE: 2592,
		PRIVATE_KEY_SIZE: 4864,
		SIGNATURE_SIZE: 4595
	},
	
	// ChaCha20-Poly1305 configuration
	CHACHA20_POLY1305: {
		KEY_SIZE: 32,
		NONCE_SIZE: 12,
		TAG_SIZE: 16
	},
	
	// Key derivation
	HKDF: {
		HASH: 'SHA-256',
		SALT_SIZE: 32,
		INFO_PREFIX: 'QryptChat-v1'
	}
};

/**
 * Base64 encoding/decoding utilities
 */
export const Base64 = {
	/**
	 * Encode Uint8Array to base64 string
	 * @param {Uint8Array} bytes
	 * @returns {string}
	 */
	encode(bytes) {
		return btoa(String.fromCharCode(...bytes));
	},

	/**
	 * Decode base64 string to Uint8Array
	 * @param {string} base64
	 * @returns {Uint8Array}
	 */
	decode(base64) {
		return new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
	}
};

/**
 * Secure random number generation
 */
export class SecureRandom {
	/**
	 * Generate cryptographically secure random bytes
	 * @param {number} length
	 * @returns {Uint8Array}
	 */
	static getRandomBytes(length) {
		const bytes = new Uint8Array(length);
		crypto.getRandomValues(bytes);
		return bytes;
	}

	/**
	 * Generate random salt for key derivation
	 * @returns {Uint8Array}
	 */
	static generateSalt() {
		return this.getRandomBytes(CRYPTO_CONFIG.HKDF.SALT_SIZE);
	}

	/**
	 * Generate random nonce for ChaCha20-Poly1305
	 * @returns {Uint8Array}
	 */
	static generateNonce() {
		return this.getRandomBytes(CRYPTO_CONFIG.CHACHA20_POLY1305.NONCE_SIZE);
	}
}

/**
 * HKDF (HMAC-based Key Derivation Function) implementation
 */
export class HKDF {
	/**
	 * Derive key using HKDF
	 * @param {Uint8Array} inputKeyMaterial
	 * @param {Uint8Array} salt
	 * @param {string} info
	 * @param {number} length
	 * @returns {Promise<Uint8Array>}
	 */
	static async derive(inputKeyMaterial, salt, info, length) {
		// Import the input key material
		const key = await crypto.subtle.importKey(
			'raw',
			inputKeyMaterial,
			{ name: 'HKDF' },
			false,
			['deriveKey', 'deriveBits']
		);

		// Derive bits using HKDF
		const derivedBits = await crypto.subtle.deriveBits(
			{
				name: 'HKDF',
				hash: CRYPTO_CONFIG.HKDF.HASH,
				salt: salt,
				info: new TextEncoder().encode(`${CRYPTO_CONFIG.HKDF.INFO_PREFIX}-${info}`)
			},
			key,
			length * 8 // Convert bytes to bits
		);

		return new Uint8Array(derivedBits);
	}

	/**
	 * Derive multiple keys from shared secret
	 * @param {Uint8Array} sharedSecret
	 * @param {Uint8Array} salt
	 * @param {string} context
	 * @returns {Promise<{rootKey: Uint8Array, chainKey: Uint8Array}>}
	 */
	static async deriveRootAndChainKeys(sharedSecret, salt, context) {
		const derivedKey = await this.derive(sharedSecret, salt, context, 64);
		
		return {
			rootKey: derivedKey.slice(0, 32),
			chainKey: derivedKey.slice(32, 64)
		};
	}

	/**
	 * Derive message key from chain key
	 * @param {Uint8Array} chainKey
	 * @param {number} messageNumber
	 * @returns {Promise<Uint8Array>}
	 */
	static async deriveMessageKey(chainKey, messageNumber) {
		const info = `MessageKey-${messageNumber}`;
		return await this.derive(chainKey, new Uint8Array(0), info, CRYPTO_CONFIG.CHACHA20_POLY1305.KEY_SIZE);
	}
}

/**
 * ChaCha20-Poly1305 symmetric encryption
 */
export class ChaCha20Poly1305 {
	/**
	 * Encrypt data using ChaCha20-Poly1305
	 * @param {Uint8Array} key
	 * @param {Uint8Array} nonce
	 * @param {Uint8Array} plaintext
	 * @param {Uint8Array} additionalData
	 * @returns {Promise<Uint8Array>}
	 */
	static async encrypt(key, nonce, plaintext, additionalData = new Uint8Array(0)) {
		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			key,
			{ name: 'ChaCha20-Poly1305' },
			false,
			['encrypt']
		);

		const encrypted = await crypto.subtle.encrypt(
			{
				name: 'ChaCha20-Poly1305',
				iv: nonce,
				additionalData: additionalData
			},
			cryptoKey,
			plaintext
		);

		return new Uint8Array(encrypted);
	}

	/**
	 * Decrypt data using ChaCha20-Poly1305
	 * @param {Uint8Array} key
	 * @param {Uint8Array} nonce
	 * @param {Uint8Array} ciphertext
	 * @param {Uint8Array} additionalData
	 * @returns {Promise<Uint8Array>}
	 */
	static async decrypt(key, nonce, ciphertext, additionalData = new Uint8Array(0)) {
		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			key,
			{ name: 'ChaCha20-Poly1305' },
			false,
			['decrypt']
		);

		const decrypted = await crypto.subtle.decrypt(
			{
				name: 'ChaCha20-Poly1305',
				iv: nonce,
				additionalData: additionalData
			},
			cryptoKey,
			ciphertext
		);

		return new Uint8Array(decrypted);
	}
}

/**
 * Error classes for cryptographic operations
 */
export class CryptoError extends Error {
	constructor(message, code) {
		super(message);
		this.name = 'CryptoError';
		this.code = code;
	}
}

export class KeyGenerationError extends CryptoError {
	constructor(message) {
		super(message, 'KEY_GENERATION_ERROR');
		this.name = 'KeyGenerationError';
	}
}

export class EncryptionError extends CryptoError {
	constructor(message) {
		super(message, 'ENCRYPTION_ERROR');
		this.name = 'EncryptionError';
	}
}

export class DecryptionError extends CryptoError {
	constructor(message) {
		super(message, 'DECRYPTION_ERROR');
		this.name = 'DecryptionError';
	}
}

export class SignatureError extends CryptoError {
	constructor(message) {
		super(message, 'SIGNATURE_ERROR');
		this.name = 'SignatureError';
	}
}

/**
 * Utility functions for cryptographic operations
 */
export class CryptoUtils {
	/**
	 * Securely compare two byte arrays in constant time
	 * @param {Uint8Array} a
	 * @param {Uint8Array} b
	 * @returns {boolean}
	 */
	static constantTimeEqual(a, b) {
		if (a.length !== b.length) {
			return false;
		}

		let result = 0;
		for (let i = 0; i < a.length; i++) {
			result |= a[i] ^ b[i];
		}

		return result === 0;
	}

	/**
	 * Securely clear sensitive data from memory
	 * @param {Uint8Array} data
	 */
	static secureClear(data) {
		if (data && data.fill) {
			data.fill(0);
		}
	}

	/**
	 * Concatenate multiple byte arrays
	 * @param {...Uint8Array} arrays
	 * @returns {Uint8Array}
	 */
	static concatenate(...arrays) {
		const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
		const result = new Uint8Array(totalLength);
		
		let offset = 0;
		for (const array of arrays) {
			result.set(array, offset);
			offset += array.length;
		}
		
		return result;
	}

	/**
	 * Generate a unique key ID for key management
	 * @returns {string}
	 */
	static generateKeyId() {
		const randomBytes = SecureRandom.getRandomBytes(16);
		return Base64.encode(randomBytes).replace(/[+/=]/g, '').substring(0, 22);
	}

	/**
	 * Hash data using SHA-256
	 * @param {Uint8Array} data
	 * @returns {Promise<Uint8Array>}
	 */
	static async hash(data) {
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		return new Uint8Array(hashBuffer);
	}

	/**
	 * Validate key sizes for different algorithms
	 * @param {Uint8Array} key
	 * @param {string} algorithm
	 * @param {string} keyType
	 * @throws {CryptoError}
	 */
	static validateKeySize(key, algorithm, keyType) {
		const config = CRYPTO_CONFIG[algorithm];
		if (!config) {
			throw new CryptoError(`Unknown algorithm: ${algorithm}`);
		}

		const expectedSize = config[`${keyType.toUpperCase()}_KEY_SIZE`];
		if (!expectedSize) {
			throw new CryptoError(`Unknown key type: ${keyType} for algorithm: ${algorithm}`);
		}

		if (key.length !== expectedSize) {
			throw new CryptoError(
				`Invalid ${keyType} key size for ${algorithm}. Expected ${expectedSize}, got ${key.length}`
			);
		}
	}
}