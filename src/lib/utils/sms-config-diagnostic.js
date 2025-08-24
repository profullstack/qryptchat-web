/**
 * @fileoverview SMS Configuration Diagnostic Tool
 * Helps debug Twilio SMS configuration issues
 */

/**
 * Diagnostic information for SMS configuration
 * @typedef {Object} SMSConfigDiagnostic
 * @property {boolean} isValid - Whether the configuration is valid
 * @property {string[]} errors - List of configuration errors
 * @property {string[]} warnings - List of configuration warnings
 * @property {Object} config - Sanitized configuration details
 * @property {string[]} suggestions - List of suggestions to fix issues
 */

/**
 * Validate Twilio phone number format
 * @param {string} phoneNumber
 * @returns {boolean}
 */
function isValidTwilioPhoneNumber(phoneNumber) {
	if (!phoneNumber) return false;
	// Twilio phone numbers should be in E.164 format: +1234567890
	const e164Regex = /^\+[1-9]\d{1,14}$/;
	return e164Regex.test(phoneNumber);
}

/**
 * Validate Twilio Message Service SID format
 * @param {string} messagingServiceSid
 * @returns {boolean}
 */
function isValidMessageServiceSid(messagingServiceSid) {
	if (!messagingServiceSid) return false;
	// Twilio Message Service SIDs start with MG and are 34 characters long
	const sidRegex = /^MG[a-f0-9]{32}$/i;
	return sidRegex.test(messagingServiceSid);
}

/**
 * Validate Twilio Account SID format
 * @param {string} accountSid
 * @returns {boolean}
 */
function isValidAccountSid(accountSid) {
	if (!accountSid) return false;
	// Twilio Account SIDs start with AC and are 34 characters long
	const sidRegex = /^AC[a-f0-9]{32}$/i;
	return sidRegex.test(accountSid);
}

/**
 * Validate Twilio Auth Token format
 * @param {string} authToken
 * @returns {boolean}
 */
function isValidAuthToken(authToken) {
	if (!authToken) return false;
	// Twilio Auth Tokens are 32 character hex strings
	const tokenRegex = /^[a-f0-9]{32}$/i;
	return tokenRegex.test(authToken);
}

/**
 * Sanitize phone number for logging (hide middle digits)
 * @param {string} phoneNumber
 * @returns {string}
 */
function sanitizePhoneNumber(phoneNumber) {
	if (!phoneNumber || phoneNumber.length < 6) return '***';
	return `${phoneNumber.substring(0, 3)}***${phoneNumber.substring(phoneNumber.length - 2)}`;
}

/**
 * Sanitize sensitive data for logging
 * @param {string} sensitive
 * @returns {string}
 */
function sanitizeSensitive(sensitive) {
	if (!sensitive) return 'NOT_SET';
	if (sensitive.length < 8) return '***';
	return `${sensitive.substring(0, 4)}***${sensitive.substring(sensitive.length - 4)}`;
}

/**
 * Diagnose SMS configuration
 * @param {Object} config - Configuration object
 * @param {string} config.TWILIO_ACCOUNT_SID
 * @param {string} config.TWILIO_AUTH_TOKEN
 * @param {string} config.TWILIO_PHONE_NUMBER
 * @param {string} config.TWILIO_MESSAGE_SERVICE_SID
 * @param {string} config.PROJECT_REF
 * @param {string} config.SUPABASE_ACCESS_TOKEN
 * @returns {SMSConfigDiagnostic}
 */
export function diagnoseSMSConfig(config) {
	const errors = [];
	const warnings = [];
	const suggestions = [];
	
	// Check required Supabase configuration
	if (!config.PROJECT_REF) {
		errors.push('PROJECT_REF is not set');
		suggestions.push('Set PROJECT_REF in your .env file (found in Supabase dashboard)');
	}
	
	if (!config.SUPABASE_ACCESS_TOKEN) {
		errors.push('SUPABASE_ACCESS_TOKEN is not set');
		suggestions.push('Generate a Supabase access token at https://supabase.com/dashboard/account/tokens');
	}
	
	// Check required Twilio configuration
	if (!config.TWILIO_ACCOUNT_SID) {
		errors.push('TWILIO_ACCOUNT_SID is not set');
		suggestions.push('Set TWILIO_ACCOUNT_SID in your .env file (found in Twilio Console)');
	} else if (!isValidAccountSid(config.TWILIO_ACCOUNT_SID)) {
		errors.push('TWILIO_ACCOUNT_SID format is invalid');
		suggestions.push('TWILIO_ACCOUNT_SID should start with "AC" and be 34 characters long');
	}
	
	if (!config.TWILIO_AUTH_TOKEN) {
		errors.push('TWILIO_AUTH_TOKEN is not set');
		suggestions.push('Set TWILIO_AUTH_TOKEN in your .env file (found in Twilio Console)');
	} else if (!isValidAuthToken(config.TWILIO_AUTH_TOKEN)) {
		errors.push('TWILIO_AUTH_TOKEN format is invalid');
		suggestions.push('TWILIO_AUTH_TOKEN should be a 32-character hexadecimal string');
	}
	
	// Check sender configuration (phone number OR message service)
	const hasPhoneNumber = !!config.TWILIO_PHONE_NUMBER;
	const hasMessageService = !!config.TWILIO_MESSAGE_SERVICE_SID;
	
	if (!hasPhoneNumber && !hasMessageService) {
		errors.push('Neither TWILIO_PHONE_NUMBER nor TWILIO_MESSAGE_SERVICE_SID is set');
		suggestions.push('Set either TWILIO_PHONE_NUMBER (e.g., +1234567890) or TWILIO_MESSAGE_SERVICE_SID (e.g., MGxxxxx...)');
	} else if (hasPhoneNumber && hasMessageService) {
		warnings.push('Both TWILIO_PHONE_NUMBER and TWILIO_MESSAGE_SERVICE_SID are set');
		suggestions.push('Twilio will use TWILIO_MESSAGE_SERVICE_SID when both are provided');
	}
	
	// Validate phone number format if provided
	if (hasPhoneNumber && !isValidTwilioPhoneNumber(config.TWILIO_PHONE_NUMBER)) {
		errors.push('TWILIO_PHONE_NUMBER format is invalid');
		suggestions.push('TWILIO_PHONE_NUMBER must be in E.164 format (e.g., +1234567890)');
	}
	
	// Validate message service SID format if provided
	if (hasMessageService && !isValidMessageServiceSid(config.TWILIO_MESSAGE_SERVICE_SID)) {
		errors.push('TWILIO_MESSAGE_SERVICE_SID format is invalid');
		suggestions.push('TWILIO_MESSAGE_SERVICE_SID should start with "MG" and be 34 characters long');
	}
	
	// Check for common configuration mistakes
	if (hasPhoneNumber && config.TWILIO_PHONE_NUMBER.startsWith('1') && !config.TWILIO_PHONE_NUMBER.startsWith('+1')) {
		warnings.push('TWILIO_PHONE_NUMBER might be missing country code prefix');
		suggestions.push('Ensure TWILIO_PHONE_NUMBER starts with + and includes country code (e.g., +1 for US)');
	}
	
	// Build sanitized config for logging
	const sanitizedConfig = {
		PROJECT_REF: config.PROJECT_REF ? `${config.PROJECT_REF.substring(0, 8)}***` : 'NOT_SET',
		SUPABASE_ACCESS_TOKEN: sanitizeSensitive(config.SUPABASE_ACCESS_TOKEN),
		TWILIO_ACCOUNT_SID: sanitizeSensitive(config.TWILIO_ACCOUNT_SID),
		TWILIO_AUTH_TOKEN: sanitizeSensitive(config.TWILIO_AUTH_TOKEN),
		TWILIO_PHONE_NUMBER: config.TWILIO_PHONE_NUMBER ? sanitizePhoneNumber(config.TWILIO_PHONE_NUMBER) : 'NOT_SET',
		TWILIO_MESSAGE_SERVICE_SID: sanitizeSensitive(config.TWILIO_MESSAGE_SERVICE_SID),
		sender_method: hasMessageService ? 'Message Service SID' : hasPhoneNumber ? 'Phone Number' : 'NONE'
	};
	
	return {
		isValid: errors.length === 0,
		errors,
		warnings,
		config: sanitizedConfig,
		suggestions
	};
}

/**
 * Generate a diagnostic report string
 * @param {SMSConfigDiagnostic} diagnostic
 * @returns {string}
 */
export function generateDiagnosticReport(diagnostic) {
	const lines = [];
	
	lines.push('=== SMS Configuration Diagnostic Report ===');
	lines.push(`Status: ${diagnostic.isValid ? '✅ VALID' : '❌ INVALID'}`);
	lines.push('');
	
	lines.push('Configuration:');
	Object.entries(diagnostic.config).forEach(([key, value]) => {
		lines.push(`  ${key}: ${value}`);
	});
	lines.push('');
	
	if (diagnostic.errors.length > 0) {
		lines.push('❌ Errors:');
		diagnostic.errors.forEach(error => lines.push(`  - ${error}`));
		lines.push('');
	}
	
	if (diagnostic.warnings.length > 0) {
		lines.push('⚠️  Warnings:');
		diagnostic.warnings.forEach(warning => lines.push(`  - ${warning}`));
		lines.push('');
	}
	
	if (diagnostic.suggestions.length > 0) {
		lines.push('💡 Suggestions:');
		diagnostic.suggestions.forEach(suggestion => lines.push(`  - ${suggestion}`));
		lines.push('');
	}
	
	lines.push('=== End Diagnostic Report ===');
	
	return lines.join('\n');
}

/**
 * Common SMS configuration issues and their solutions
 */
export const SMS_TROUBLESHOOTING_GUIDE = {
	'messages_sent_to_twilio_number': {
		problem: 'SMS messages are being sent TO your Twilio number instead of FROM it',
		causes: [
			'TWILIO_PHONE_NUMBER is set to the wrong number (recipient instead of sender)',
			'Twilio webhook is configured incorrectly',
			'Phone number ownership is not verified in Twilio'
		],
		solutions: [
			'Verify TWILIO_PHONE_NUMBER is the number you purchased from Twilio',
			'Check Twilio Console to confirm the phone number is active and verified',
			'Ensure the phone number has SMS capabilities enabled',
			'Run the supabase-twilio.sh script to reconfigure Supabase with correct settings'
		]
	},
	'only_one_number_works': {
		problem: 'SMS only works for one specific phone number',
		causes: [
			'Twilio trial account restrictions (can only send to verified numbers)',
			'Phone number verification requirements',
			'Geographic restrictions on SMS sending'
		],
		solutions: [
			'Upgrade Twilio account from trial to paid',
			'Add recipient phone numbers to Twilio verified caller IDs (trial accounts)',
			'Check Twilio geographic permissions for SMS sending',
			'Review Twilio account limits and restrictions'
		]
	}
};