/**
 * Mock SMS Provider for Development Testing
 * 
 * This module provides a mock SMS service that simulates SMS sending
 * without actually sending real SMS messages. It's designed for
 * development and testing environments.
 */

/**
 * Mock SMS provider that simulates SMS sending
 * Always returns success and uses a fixed verification code for testing
 */
export class MockSMSProvider {
	constructor() {
		this.sentMessages = new Map();
		this.fixedCode = '123456'; // Fixed code for testing
	}

	/**
	 * Mock SMS sending - simulates sending an SMS
	 * @param {string} phoneNumber - Phone number in E.164 format
	 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
	 */
	async sendSMS(phoneNumber) {
		// Simulate network delay
		await new Promise(resolve => setTimeout(resolve, 100));

		// Validate phone number format
		if (!phoneNumber || !phoneNumber.startsWith('+')) {
			return {
				success: false,
				error: 'Invalid phone number format. Must be in E.164 format (e.g., +1234567890)'
			};
		}

		// Store the "sent" message
		const messageId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		this.sentMessages.set(phoneNumber, {
			messageId,
			code: this.fixedCode,
			sentAt: new Date().toISOString(),
			phoneNumber
		});

		console.log(`[MOCK-SMS] Simulated SMS sent to ${phoneNumber} with code: ${this.fixedCode}`);

		return {
			success: true,
			messageId
		};
	}

	/**
	 * Mock SMS verification - checks against the fixed code
	 * @param {string} phoneNumber - Phone number in E.164 format
	 * @param {string} code - Verification code to check
	 * @returns {Promise<{success: boolean, error?: string}>}
	 */
	async verifySMS(phoneNumber, code) {
		// Simulate network delay
		await new Promise(resolve => setTimeout(resolve, 50));

		const sentMessage = this.sentMessages.get(phoneNumber);
		
		if (!sentMessage) {
			return {
				success: false,
				error: 'No SMS sent to this phone number'
			};
		}

		// Check if code matches (always use fixed code for testing)
		if (code === this.fixedCode) {
			// Remove the used code
			this.sentMessages.delete(phoneNumber);
			
			console.log(`[MOCK-SMS] SMS verification successful for ${phoneNumber}`);
			
			return {
				success: true
			};
		} else {
			return {
				success: false,
				error: 'Invalid verification code'
			};
		}
	}

	/**
	 * Get all sent messages (for testing/debugging)
	 * @returns {Array} Array of sent message objects
	 */
	getSentMessages() {
		return Array.from(this.sentMessages.values());
	}

	/**
	 * Clear all sent messages (for testing)
	 */
	clearSentMessages() {
		this.sentMessages.clear();
	}

	/**
	 * Get the fixed verification code (for testing)
	 * @returns {string} The fixed verification code
	 */
	getFixedCode() {
		return this.fixedCode;
	}
}

// Export singleton instance
export const mockSMSProvider = new MockSMSProvider();

/**
 * Development helper to log the current fixed code
 */
export function logMockSMSCode() {
	console.log(`[MOCK-SMS] Use verification code: ${mockSMSProvider.getFixedCode()}`);
}