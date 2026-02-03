/**
 * @fileoverview SMS Authentication Debug Endpoint
 * Provides comprehensive debugging for SMS authentication issues
 * 
 * SECURITY: This endpoint is restricted to development mode only
 */

import { json } from '@sveltejs/kit';
import { SMSAuthDiagnostics } from '$lib/utils/sms-debug.js';

// Security check - only allow in development
function isDevelopment() {
	return process.env.NODE_ENV === 'development';
}

/**
 * POST /api/auth/debug-sms
 * Run SMS authentication diagnostics
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function POST(event) {
	// SECURITY: Block in production
	if (!isDevelopment()) {
		return json({ error: 'Debug endpoints are disabled in production' }, { status: 403 });
	}

	const { request } = event;
	
	try {
		const { phoneNumber, action = 'diagnose' } = await request.json();

		if (!phoneNumber) {
			return json(
				{ error: 'Phone number is required for diagnostics' },
				{ status: 400 }
			);
		}

		const diagnostics = new SMSAuthDiagnostics(event);

		switch (action) {
			case 'diagnose':
				const result = await diagnostics.runDiagnostics(phoneNumber);
				return json(result);

			case 'test-send':
				const sendResult = await diagnostics.testSMSSending(phoneNumber);
				return json({
					success: sendResult.success,
					error: sendResult.error?.message,
					logs: diagnostics.logger.getLogs()
				});

			case 'test-verify':
				const { verificationCode } = await request.json();
				if (!verificationCode) {
					return json(
						{ error: 'Verification code is required for verify test' },
						{ status: 400 }
					);
				}
				
				const verifyResult = await diagnostics.testSMSVerification(phoneNumber, verificationCode);
				return json({
					success: verifyResult.success,
					error: verifyResult.error?.message,
					data: verifyResult.data,
					logs: diagnostics.logger.getLogs()
				});

			default:
				return json(
					{ error: 'Invalid action. Use: diagnose, test-send, or test-verify' },
					{ status: 400 }
				);
		}

	} catch (error) {
		console.error('SMS Debug endpoint error:', error);
		return json(
			{ 
				error: 'Internal server error',
				details: error.message,
				stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
			},
			{ status: 500 }
		);
	}
}

/**
 * GET /api/auth/debug-sms
 * Get SMS authentication system status
 */
export async function GET(event) {
	// SECURITY: Block in production
	if (!isDevelopment()) {
		return json({ error: 'Debug endpoints are disabled in production' }, { status: 403 });
	}

	try {
		const diagnostics = new SMSAuthDiagnostics(event);
		
		// Run basic system checks without phone number
		const result = await diagnostics.runDiagnostics('+1234567890'); // Dummy number for format check
		
		return json({
			systemStatus: result.success ? 'healthy' : 'issues_detected',
			environment: process.env.NODE_ENV,
			timestamp: new Date().toISOString(),
			checks: {
				environment: result.issues.filter(issue => issue.includes('environment')).length === 0,
				supabase: result.issues.filter(issue => issue.includes('Supabase')).length === 0,
				database: result.issues.filter(issue => issue.includes('Database')).length === 0
			},
			issues: result.issues,
			logs: result.logs
		});

	} catch (error) {
		console.error('SMS Debug status error:', error);
		return json(
			{ 
				systemStatus: 'error',
				error: error.message,
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
}