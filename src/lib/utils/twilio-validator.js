/**
 * @fileoverview Twilio Credential Validator
 * Provides utilities to validate and test Twilio credentials
 */

/**
 * Validate Twilio credentials format
 * @param {Object} credentials
 * @param {string} credentials.accountSid - Twilio Account SID
 * @param {string} credentials.authToken - Twilio Auth Token
 * @param {string} credentials.phoneNumber - Twilio phone number
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateTwilioCredentials(credentials) {
	const errors = [];

	// Validate Account SID
	if (!credentials.accountSid) {
		errors.push('Account SID is required');
	} else if (!credentials.accountSid.startsWith('AC')) {
		errors.push('Account SID must start with "AC"');
	} else if (credentials.accountSid.length !== 34) {
		errors.push('Account SID must be 34 characters long');
	}

	// Validate Auth Token
	if (!credentials.authToken) {
		errors.push('Auth Token is required');
	} else if (credentials.authToken.length !== 32) {
		errors.push('Auth Token must be 32 characters long');
	}

	// Validate Phone Number (if provided, messaging service SID is alternative)
	if (credentials.phoneNumber) {
		const phoneRegex = /^\+[1-9]\d{1,14}$/;
		if (!phoneRegex.test(credentials.phoneNumber)) {
			errors.push('Phone number must be in E.164 format (e.g., +14155551234)');
		}
	} else if (credentials.messagingServiceSid) {
		if (!credentials.messagingServiceSid.startsWith('MG')) {
			errors.push('Messaging Service SID must start with "MG"');
		}
	} else {
		errors.push('Either phone number or messaging service SID is required');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Parse Twilio error code and provide helpful message
 * @param {number} errorCode - Twilio error code
 * @returns {string} User-friendly error message
 */
export function parseTwilioError(errorCode) {
	const errorMessages = {
		20003: 'Authentication failed. Check your Twilio Account SID and Auth Token in Supabase Dashboard.',
		20404: 'Phone number not found. Verify your Twilio phone number is correct.',
		21211: 'Invalid phone number. Ensure the recipient number is in E.164 format.',
		21408: 'Permission denied. Your Twilio account may not have permission to send to this number.',
		21610: 'Unverified number. Trial accounts can only send to verified numbers. Upgrade your Twilio account or verify the recipient.',
		30003: 'Unreachable destination. The phone number may be invalid or unable to receive SMS.',
		30006: 'Landline or unreachable carrier. This number cannot receive SMS messages.',
		30007: 'Message filtered. The carrier has blocked this message.',
		30008: 'Unknown error from carrier. Try again or contact the recipient.',
		21606: 'Phone number not verified. Add this number to your Twilio verified numbers (trial accounts only).'
	};

	return errorMessages[errorCode] || `Twilio error ${errorCode}. Check Twilio documentation for details.`;
}

/**
 * Extract Twilio error code from error message
 * @param {string} errorMessage - Error message from Supabase/Twilio
 * @returns {number|null} Twilio error code or null
 */
export function extractTwilioErrorCode(errorMessage) {
	// Match patterns like "Error 20003" or "20003"
	const match = errorMessage.match(/(?:Error\s+)?(\d{5})/);
	return match ? parseInt(match[1], 10) : null;
}

/**
 * Get comprehensive error information for SMS failures
 * @param {Error} error - The error object
 * @returns {Object} Detailed error information
 */
export function getSMSErrorDetails(error) {
	const errorMessage = error.message || '';
	const twilioErrorCode = extractTwilioErrorCode(errorMessage);
	
	let userMessage = 'Failed to send SMS. Please try again.';
	let suggestion = null;
	let actionRequired = null;

	if (errorMessage.includes('Authenticate') || twilioErrorCode === 20003) {
		userMessage = 'SMS service authentication failed.';
		suggestion = 'Your Twilio credentials need to be configured or updated in Supabase Dashboard.';
		actionRequired = 'CONFIGURE_TWILIO';
	} else if (twilioErrorCode === 21610 || errorMessage.includes('not verified')) {
		userMessage = 'Cannot send to unverified number.';
		suggestion = 'Trial Twilio accounts can only send to verified numbers. Either verify this number in Twilio Console or upgrade your account.';
		actionRequired = 'VERIFY_NUMBER_OR_UPGRADE';
	} else if (twilioErrorCode === 21211 || errorMessage.includes('Invalid phone number')) {
		userMessage = 'Invalid phone number format.';
		suggestion = 'Ensure the phone number is in E.164 format (e.g., +14155551234).';
		actionRequired = 'FIX_PHONE_FORMAT';
	} else if (twilioErrorCode) {
		userMessage = parseTwilioError(twilioErrorCode);
		suggestion = `Twilio error code: ${twilioErrorCode}`;
	}

	return {
		userMessage,
		suggestion,
		actionRequired,
		twilioErrorCode,
		originalError: errorMessage
	};
}