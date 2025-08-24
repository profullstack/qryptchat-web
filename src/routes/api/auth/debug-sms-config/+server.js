/**
 * @fileoverview API endpoint for SMS configuration diagnostics
 * Helps debug Twilio SMS configuration issues
 */

import { json } from '@sveltejs/kit';
import { diagnoseSMSConfig, generateDiagnosticReport } from '$lib/utils/sms-config-diagnostic.js';

/**
 * GET /api/auth/debug-sms-config
 * Run SMS configuration diagnostics
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function GET(event) {
	try {
		// Gather configuration from environment variables
		const config = {
			PROJECT_REF: process.env.PROJECT_REF,
			SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN,
			TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
			TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
			TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
			TWILIO_MESSAGE_SERVICE_SID: process.env.TWILIO_MESSAGE_SERVICE_SID
		};

		// Run diagnostic
		const diagnostic = diagnoseSMSConfig(config);
		const report = generateDiagnosticReport(diagnostic);

		// Log the report to console for debugging
		console.log('\n' + report);

		// Return diagnostic results
		return json({
			success: true,
			diagnostic,
			report,
			timestamp: new Date().toISOString(),
			environment: process.env.NODE_ENV
		});

	} catch (error) {
		console.error('SMS config diagnostic error:', error);
		
		return json(
			{
				success: false,
				error: 'Failed to run SMS configuration diagnostic',
				message: error.message,
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
}

/**
 * POST /api/auth/debug-sms-config
 * Test SMS configuration with a specific phone number
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function POST(event) {
	const { request } = event;
	
	try {
		const { testPhoneNumber } = await request.json();
		
		if (!testPhoneNumber) {
			return json(
				{ error: 'testPhoneNumber is required' },
				{ status: 400 }
			);
		}

		// First run the diagnostic
		const config = {
			PROJECT_REF: process.env.PROJECT_REF,
			SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN,
			TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
			TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
			TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
			TWILIO_MESSAGE_SERVICE_SID: process.env.TWILIO_MESSAGE_SERVICE_SID
		};

		const diagnostic = diagnoseSMSConfig(config);
		
		if (!diagnostic.isValid) {
			return json({
				success: false,
				error: 'SMS configuration is invalid',
				diagnostic,
				report: generateDiagnosticReport(diagnostic)
			}, { status: 400 });
		}

		// If configuration is valid, test sending SMS
		const { createSupabaseServerClient } = await import('$lib/supabase.js');
		const supabase = createSupabaseServerClient(event);
		
		console.log(`Testing SMS send to: ${testPhoneNumber}`);
		console.log(`Using Twilio config: Account SID: ${config.TWILIO_ACCOUNT_SID?.substring(0, 8)}***`);
		console.log(`From number: ${config.TWILIO_PHONE_NUMBER || 'Message Service: ' + config.TWILIO_MESSAGE_SERVICE_SID?.substring(0, 8) + '***'}`);
		
		const { error: smsError } = await supabase.auth.signInWithOtp({
			phone: testPhoneNumber,
			options: {
				channel: 'sms',
				shouldCreateUser: true
			}
		});

		if (smsError) {
			console.error('SMS test failed:', smsError);
			
			return json({
				success: false,
				error: 'SMS test failed',
				smsError: {
					message: smsError.message,
					status: smsError.status,
					code: smsError.code
				},
				diagnostic,
				testPhoneNumber: testPhoneNumber.substring(0, 3) + '***' + testPhoneNumber.substring(testPhoneNumber.length - 2),
				timestamp: new Date().toISOString()
			}, { status: 400 });
		}

		console.log('SMS test successful');
		
		return json({
			success: true,
			message: 'SMS test successful',
			diagnostic,
			testPhoneNumber: testPhoneNumber.substring(0, 3) + '***' + testPhoneNumber.substring(testPhoneNumber.length - 2),
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('SMS config test error:', error);
		
		return json(
			{
				success: false,
				error: 'Failed to test SMS configuration',
				message: error.message,
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
}