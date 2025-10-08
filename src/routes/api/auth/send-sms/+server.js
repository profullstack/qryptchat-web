/**
 * @fileoverview API endpoint for sending SMS verification codes
 * Handles SMS code generation and sending via Supabase Auth
 */

import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { SMSDebugLogger, formatSMSError } from '$lib/utils/sms-debug.js';
import { getSMSErrorDetails } from '$lib/utils/twilio-validator.js';

/**
 * Validate phone number format
 * @param {string} phoneNumber
 * @returns {boolean}
 */
function isValidPhoneNumber(phoneNumber) {
	// Basic E.164 format validation
	const phoneRegex = /^\+[1-9]\d{1,14}$/;
	return phoneRegex.test(phoneNumber);
}

/**
 * Generate a 6-digit verification code
 * @returns {string}
 */
function generateVerificationCode() {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /api/auth/send-sms
 * Send SMS verification code
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function POST(event) {
	const { request } = event;
	const logger = new SMSDebugLogger();
	
	try {
		const { phoneNumber } = await request.json();
		
		logger.info('SMS send request received', {
			phoneNumber: phoneNumber ? `${phoneNumber.substring(0, 3)}***${phoneNumber.substring(phoneNumber.length - 2)}` : null,
			userAgent: request.headers.get('user-agent'),
			ip: event.getClientAddress()
		});

		// Validate input
		if (!phoneNumber) {
			logger.error('Phone number missing in request');
			return json(
				{ error: 'Phone number is required' },
				{ status: 400 }
			);
		}

		if (!isValidPhoneNumber(phoneNumber)) {
			logger.error('Invalid phone number format', { phoneNumber });
			return json(
				{
					error: 'Invalid phone number format. Please use E.164 format (e.g., +1234567890)',
					suggestion: 'Ensure your phone number starts with + and includes country code'
				},
				{ status: 400 }
			);
		}

		// Create Supabase client
		const supabase = createSupabaseServerClient(event);
		
		logger.info('Attempting to send SMS via Supabase Auth');
		logger.info('Supabase project URL:', process.env.PUBLIC_SUPABASE_URL);

		// Send SMS using Supabase Auth (this handles everything internally)
		const { error: smsError } = await supabase.auth.signInWithOtp({
			phone: phoneNumber,
			options: {
				channel: 'sms',
				shouldCreateUser: true // Allow Supabase to create auth user for SMS sending
			}
		});

		if (smsError) {
			const errorInfo = formatSMSError(smsError, {
				phoneNumber,
				action: 'send_sms',
				environment: process.env.NODE_ENV
			});
			
			// Get detailed error information with Twilio-specific handling
			const errorDetails = getSMSErrorDetails(smsError);
			
			logger.error('SMS sending failed', {
				...errorInfo,
				errorDetails
			});
			
			// Log to console for production debugging
			console.error('SMS sending error:', {
				...errorInfo,
				errorDetails,
				logs: logger.getLogsAsString()
			});

			// Determine HTTP status code
			let statusCode = 500;
			if (smsError.status === 429) {
				statusCode = 429;
			} else if (errorDetails.actionRequired === 'CONFIGURE_TWILIO') {
				statusCode = 503; // Service Unavailable
			} else if (errorDetails.actionRequired === 'FIX_PHONE_FORMAT') {
				statusCode = 400; // Bad Request
			}

			return json(
				{
					error: errorDetails.userMessage,
					code: smsError.status || 'SMS_SEND_FAILED',
					...(errorDetails.suggestion && { suggestion: errorDetails.suggestion }),
					...(errorDetails.actionRequired && { actionRequired: errorDetails.actionRequired }),
					...(process.env.NODE_ENV === 'development' && {
						debug: errorInfo,
						logs: logger.getLogs(),
						twilioErrorCode: errorDetails.twilioErrorCode
					})
				},
				{ status: statusCode }
			);
		}

		logger.info('SMS sent successfully');
		
		// Log success for monitoring
		console.log('SMS sent successfully:', {
			phoneNumber: `${phoneNumber.substring(0, 3)}***${phoneNumber.substring(phoneNumber.length - 2)}`,
			timestamp: new Date().toISOString(),
			environment: process.env.NODE_ENV
		});

		return json({
			success: true,
			message: 'Verification code sent successfully',
			...(process.env.NODE_ENV === 'development' && {
				logs: logger.getLogs()
			})
		});

	} catch (error) {
		const errorInfo = formatSMSError(error, {
			action: 'send_sms',
			environment: process.env.NODE_ENV
		});
		
		logger.error('Send SMS exception', errorInfo);
		
		// Log to console for production debugging
		console.error('Send SMS error:', {
			...errorInfo,
			logs: logger.getLogsAsString()
		});

		return json(
			{
				error: 'Internal server error',
				code: 'INTERNAL_ERROR',
				...(process.env.NODE_ENV === 'development' && {
					debug: errorInfo,
					logs: logger.getLogs()
				})
			},
			{ status: 500 }
		);
	}
}