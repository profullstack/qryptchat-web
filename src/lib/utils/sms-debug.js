/**
 * @fileoverview SMS Authentication Debugging Utilities
 * Provides comprehensive debugging tools for SMS authentication issues
 */

import { createSupabaseServerClient } from '$lib/supabase.js';

/**
 * SMS Debug levels
 */
export const SMS_DEBUG_LEVELS = {
	ERROR: 'error',
	WARN: 'warn',
	INFO: 'info',
	DEBUG: 'debug'
};

/**
 * SMS Debug logger
 */
export class SMSDebugLogger {
	constructor(level = SMS_DEBUG_LEVELS.INFO) {
		this.level = level;
		this.logs = [];
	}

	log(level, message, data = null) {
		const logEntry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			data: data ? JSON.stringify(data, null, 2) : null
		};

		this.logs.push(logEntry);

		// Console output for development
		if (process.env.NODE_ENV === 'development') {
			console.log(`[SMS-${level.toUpperCase()}] ${message}`, data || '');
		}
	}

	error(message, data) {
		this.log(SMS_DEBUG_LEVELS.ERROR, message, data);
	}

	warn(message, data) {
		this.log(SMS_DEBUG_LEVELS.WARN, message, data);
	}

	info(message, data) {
		this.log(SMS_DEBUG_LEVELS.INFO, message, data);
	}

	debug(message, data) {
		this.log(SMS_DEBUG_LEVELS.DEBUG, message, data);
	}

	getLogs() {
		return this.logs;
	}

	getLogsAsString() {
		return this.logs
			.map(log => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${log.data ? '\n' + log.data : ''}`)
			.join('\n');
	}
}

/**
 * SMS Authentication Diagnostics
 */
export class SMSAuthDiagnostics {
	constructor(event) {
		this.event = event;
		this.logger = new SMSDebugLogger();
		this.supabase = createSupabaseServerClient(event);
	}

	/**
	 * Run comprehensive SMS authentication diagnostics
	 * @param {string} phoneNumber
	 * @returns {Promise<{success: boolean, issues: string[], logs: string[]}>}
	 */
	async runDiagnostics(phoneNumber) {
		this.logger.info('Starting SMS authentication diagnostics', { phoneNumber });
		const issues = [];

		try {
			// 1. Check environment configuration
			await this.checkEnvironmentConfig(issues);

			// 2. Check Supabase configuration
			await this.checkSupabaseConfig(issues);

			// 3. Check phone number format
			this.checkPhoneNumberFormat(phoneNumber, issues);

			// 4. Check database connectivity
			await this.checkDatabaseConnectivity(issues);

			// 5. Check SMS provider configuration
			await this.checkSMSProviderConfig(issues);

			// 6. Test SMS sending (if requested)
			// Note: We don't automatically send SMS in diagnostics to avoid spam

			this.logger.info('Diagnostics completed', { 
				issuesFound: issues.length,
				issues: issues
			});

			return {
				success: issues.length === 0,
				issues,
				logs: this.logger.getLogs()
			};

		} catch (error) {
			this.logger.error('Diagnostics failed', { error: error.message, stack: error.stack });
			issues.push(`Diagnostics failed: ${error.message}`);

			return {
				success: false,
				issues,
				logs: this.logger.getLogs()
			};
		}
	}

	/**
	 * Check environment configuration
	 */
	async checkEnvironmentConfig(issues) {
		this.logger.info('Checking environment configuration');

		const requiredEnvVars = [
			'PUBLIC_SUPABASE_URL',
			'PUBLIC_SUPABASE_ANON_KEY'
		];

		for (const envVar of requiredEnvVars) {
			if (!process.env[envVar]) {
				const issue = `Missing required environment variable: ${envVar}`;
				this.logger.error(issue);
				issues.push(issue);
			}
		}

		// Check if we're in production
		if (process.env.NODE_ENV === 'production') {
			this.logger.info('Running in production mode');
			
			// Additional production checks
			if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
				const issue = 'Missing SUPABASE_SERVICE_ROLE_KEY in production';
				this.logger.warn(issue);
				issues.push(issue);
			}
		}
	}

	/**
	 * Check Supabase configuration
	 */
	async checkSupabaseConfig(issues) {
		this.logger.info('Checking Supabase configuration');

		try {
			// Test basic connectivity
			const { data, error } = await this.supabase.from('users').select('count').limit(1);
			
			if (error) {
				const issue = `Supabase connectivity error: ${error.message}`;
				this.logger.error(issue, error);
				issues.push(issue);
			} else {
				this.logger.info('Supabase connectivity OK');
			}

		} catch (error) {
			const issue = `Supabase configuration error: ${error.message}`;
			this.logger.error(issue, error);
			issues.push(issue);
		}
	}

	/**
	 * Check phone number format
	 */
	checkPhoneNumberFormat(phoneNumber, issues) {
		this.logger.info('Checking phone number format', { phoneNumber });

		if (!phoneNumber) {
			const issue = 'Phone number is required';
			this.logger.error(issue);
			issues.push(issue);
			return;
		}

		// E.164 format validation
		const phoneRegex = /^\+[1-9]\d{1,14}$/;
		if (!phoneRegex.test(phoneNumber)) {
			const issue = `Invalid phone number format: ${phoneNumber}. Must be E.164 format (e.g., +1234567890)`;
			this.logger.error(issue);
			issues.push(issue);
		} else {
			this.logger.info('Phone number format is valid');
		}
	}

	/**
	 * Check database connectivity
	 */
	async checkDatabaseConnectivity(issues) {
		this.logger.info('Checking database connectivity');

		try {
			// Check if required tables exist
			const tables = ['users'];
			
			for (const table of tables) {
				const { error } = await this.supabase.from(table).select('*').limit(1);
				
				if (error) {
					const issue = `Database table '${table}' not accessible: ${error.message}`;
					this.logger.error(issue, error);
					issues.push(issue);
				} else {
					this.logger.info(`Database table '${table}' is accessible`);
				}
			}

		} catch (error) {
			const issue = `Database connectivity error: ${error.message}`;
			this.logger.error(issue, error);
			issues.push(issue);
		}
	}

	/**
	 * Check SMS provider configuration
	 */
	async checkSMSProviderConfig(issues) {
		this.logger.info('Checking SMS provider configuration');

		try {
			// Try to get auth settings (this will fail if SMS isn't configured)
			// Note: This is a basic check - in production you'd want to verify with Supabase admin API
			
			this.logger.warn('SMS provider configuration check requires admin access - skipping detailed check');
			this.logger.info('Ensure SMS provider (Twilio) is configured in Supabase Dashboard > Authentication > Providers');

		} catch (error) {
			const issue = `SMS provider configuration error: ${error.message}`;
			this.logger.error(issue, error);
			issues.push(issue);
		}
	}

	/**
	 * Test SMS sending with detailed logging
	 */
	async testSMSSending(phoneNumber) {
		this.logger.info('Testing SMS sending', { phoneNumber });

		try {
			const { error: smsError } = await this.supabase.auth.signInWithOtp({
				phone: phoneNumber,
				options: {
					channel: 'sms',
					shouldCreateUser: false
				}
			});

			if (smsError) {
				this.logger.error('SMS sending failed', {
					error: smsError.message,
					code: smsError.status,
					details: smsError
				});
				return { success: false, error: smsError };
			}

			this.logger.info('SMS sent successfully');
			return { success: true };

		} catch (error) {
			this.logger.error('SMS sending exception', {
				error: error.message,
				stack: error.stack
			});
			return { success: false, error };
		}
	}

	/**
	 * Test SMS verification with detailed logging
	 */
	async testSMSVerification(phoneNumber, verificationCode) {
		this.logger.info('Testing SMS verification', { phoneNumber, codeLength: verificationCode?.length });

		try {
			const { data: verifyData, error: verifyError } = await this.supabase.auth.verifyOtp({
				phone: phoneNumber,
				token: verificationCode,
				type: 'sms'
			});

			if (verifyError) {
				this.logger.error('SMS verification failed', {
					error: verifyError.message,
					code: verifyError.status,
					details: verifyError
				});
				return { success: false, error: verifyError };
			}

			if (!verifyData.user) {
				this.logger.error('SMS verification returned no user data');
				return { success: false, error: new Error('No user data returned') };
			}

			this.logger.info('SMS verification successful', {
				userId: verifyData.user.id,
				userPhone: verifyData.user.phone
			});

			return { success: true, data: verifyData };

		} catch (error) {
			this.logger.error('SMS verification exception', {
				error: error.message,
				stack: error.stack
			});
			return { success: false, error };
		}
	}
}

/**
 * Enhanced error formatter for SMS authentication
 */
export function formatSMSError(error, context = {}) {
	const errorInfo = {
		timestamp: new Date().toISOString(),
		context,
		error: {
			message: error.message,
			code: error.status || error.code,
			name: error.name
		}
	};

	// Add specific SMS error handling
	if (error.message?.includes('Invalid phone number')) {
		errorInfo.suggestion = 'Ensure phone number is in E.164 format (e.g., +1234567890)';
	} else if (error.message?.includes('SMS not configured')) {
		errorInfo.suggestion = 'Configure SMS provider in Supabase Dashboard > Authentication > Providers';
	} else if (error.message?.includes('Invalid verification code')) {
		errorInfo.suggestion = 'Check if code has expired or if user entered it correctly';
	} else if (error.message?.includes('Too many requests')) {
		errorInfo.suggestion = 'Rate limiting is active - wait before retrying';
	}

	return errorInfo;
}