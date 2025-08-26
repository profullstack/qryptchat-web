/**
 * @fileoverview Master key derivation from user credentials
 * Derives encryption keys from phone number + PIN/password using PBKDF2
 */

import { browser } from '$app/environment';

/**
 * Master key derivation service
 * Uses PBKDF2 with SHA-256 to derive keys from user credentials
 */
export class MasterKeyDerivation {
	/**
	 * Derive master key from phone number and PIN
	 * @param {string} phoneNumber - User's phone number
	 * @param {string} pin - User's PIN or password
	 * @param {number} iterations - PBKDF2 iterations (default: 100000)
	 * @returns {Promise<Uint8Array>} 256-bit master key
	 */
	static async deriveFromCredentials(phoneNumber, pin, iterations = 100000) {
		if (!browser) {
			throw new Error('Master key derivation only available in browser');
		}

		try {
			// Create salt from phone number (deterministic but unique per user)
			const salt = await this.createPhoneSalt(phoneNumber);
			
			return await this.deriveWithSalt(phoneNumber, pin, salt, iterations);
		} catch (error) {
			console.error('🔑 Failed to derive master key from credentials:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Master key derivation failed: ${errorMessage}`);
		}
	}

	/**
	 * Derive master key with custom salt
	 * @param {string} phoneNumber - User's phone number
	 * @param {string} pin - User's PIN or password
	 * @param {Uint8Array} salt - Custom salt
	 * @param {number} iterations - PBKDF2 iterations
	 * @returns {Promise<Uint8Array>} 256-bit master key
	 */
	static async deriveWithSalt(phoneNumber, pin, salt, iterations = 100000) {
		if (!browser) {
			throw new Error('Master key derivation only available in browser');
		}

		try {
			// Combine phone number and PIN as password
			const password = `${phoneNumber}:${pin}`;
			const passwordBuffer = new TextEncoder().encode(password);

			// Import password as key material
			const keyMaterial = await crypto.subtle.importKey(
				'raw',
				passwordBuffer,
				{ name: 'PBKDF2' },
				false,
				['deriveKey']
			);

			// Derive 256-bit key using PBKDF2
			const derivedKey = await crypto.subtle.deriveKey(
				{
					name: 'PBKDF2',
					salt: salt,
					iterations: iterations,
					hash: 'SHA-256'
				},
				keyMaterial,
				{
					name: 'AES-GCM',
					length: 256
				},
				true, // extractable
				['encrypt', 'decrypt']
			);

			// Export key as raw bytes
			const keyBuffer = await crypto.subtle.exportKey('raw', derivedKey);
			const masterKey = new Uint8Array(keyBuffer);

			console.log('🔑 Successfully derived master key');
			return masterKey;
		} catch (error) {
			console.error('🔑 Failed to derive master key with salt:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Master key derivation failed: ${errorMessage}`);
		}
	}

	/**
	 * Create deterministic salt from phone number
	 * @param {string} phoneNumber - User's phone number
	 * @returns {Promise<Uint8Array>} 256-bit salt
	 */
	static async createPhoneSalt(phoneNumber) {
		try {
			// Use phone number + fixed string to create deterministic salt
			const saltInput = `qryptchat-salt-${phoneNumber}`;
			const saltBuffer = new TextEncoder().encode(saltInput);

			// Hash to create 256-bit salt
			const hashBuffer = await crypto.subtle.digest('SHA-256', saltBuffer);
			return new Uint8Array(hashBuffer);
		} catch (error) {
			console.error('🔑 Failed to create phone salt:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Salt creation failed: ${errorMessage}`);
		}
	}

	/**
	 * Generate random salt for additional security
	 * @returns {Uint8Array} 256-bit random salt
	 */
	static generateSalt() {
		const salt = new Uint8Array(32); // 256 bits
		crypto.getRandomValues(salt);
		return salt;
	}

	/**
	 * Verify PIN strength
	 * @param {string} pin - PIN to verify
	 * @returns {Object} Verification result with strength score
	 */
	static verifyPinStrength(pin) {
		const result = {
			isValid: false,
			strength: 0,
			issues: /** @type {string[]} */ ([])
		};

		if (!pin || typeof pin !== 'string') {
			result.issues.push('PIN is required');
			return result;
		}

		// Minimum length check
		if (pin.length < 6) {
			result.issues.push('PIN must be at least 6 characters');
		} else {
			result.strength += 20;
		}

		// Maximum length check
		if (pin.length > 50) {
			result.issues.push('PIN must be less than 50 characters');
			return result;
		}

		// Character variety checks
		const hasNumbers = /\d/.test(pin);
		const hasLowercase = /[a-z]/.test(pin);
		const hasUppercase = /[A-Z]/.test(pin);
		const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pin);

		if (hasNumbers) result.strength += 20;
		if (hasLowercase) result.strength += 20;
		if (hasUppercase) result.strength += 20;
		if (hasSpecialChars) result.strength += 20;

		// Length bonus
		if (pin.length >= 8) result.strength += 10;
		if (pin.length >= 12) result.strength += 10;

		// Common pattern penalties
		if (/^(\d)\1+$/.test(pin)) {
			result.issues.push('PIN cannot be all the same digit');
			result.strength -= 50;
		}

		if (/^(012|123|234|345|456|567|678|789|890|987|876|765|654|543|432|321|210)/.test(pin)) {
			result.issues.push('PIN cannot be a simple sequence');
			result.strength -= 30;
		}

		// Set validity
		result.isValid = result.issues.length === 0 && result.strength >= 40;
		result.strength = Math.max(0, Math.min(100, result.strength));

		return result;
	}

	/**
	 * Create backup verification hash
	 * Used to verify PIN without storing it
	 * @param {string} phoneNumber - User's phone number
	 * @param {string} pin - User's PIN
	 * @returns {Promise<string>} Base64 verification hash
	 */
	static async createVerificationHash(phoneNumber, pin) {
		try {
			const input = `verify-${phoneNumber}-${pin}`;
			const inputBuffer = new TextEncoder().encode(input);
			const hashBuffer = await crypto.subtle.digest('SHA-256', inputBuffer);
			const hashArray = new Uint8Array(hashBuffer);
			
			// Convert to base64
			return btoa(String.fromCharCode(...hashArray));
		} catch (error) {
			console.error('🔑 Failed to create verification hash:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Verification hash creation failed: ${errorMessage}`);
		}
	}

	/**
	 * Verify PIN against stored hash
	 * @param {string} phoneNumber - User's phone number
	 * @param {string} pin - PIN to verify
	 * @param {string} storedHash - Stored verification hash
	 * @returns {Promise<boolean>} Whether PIN is correct
	 */
	static async verifyPin(phoneNumber, pin, storedHash) {
		try {
			const computedHash = await this.createVerificationHash(phoneNumber, pin);
			return computedHash === storedHash;
		} catch (error) {
			console.error('🔑 Failed to verify PIN:', error);
			return false;
		}
	}

	/**
	 * Securely clear sensitive data from memory
	 * @param {Uint8Array} data - Data to clear
	 */
	static secureClear(data) {
		if (data && data.fill) {
			data.fill(0);
		}
	}
}