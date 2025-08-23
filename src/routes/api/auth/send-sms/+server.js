/**
 * @fileoverview API endpoint for sending SMS verification codes
 * Handles SMS code generation and sending via Supabase Auth
 */

import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

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
	
	try {
		const { phoneNumber } = await request.json();

		// Validate input
		if (!phoneNumber) {
			return json(
				{ error: 'Phone number is required' },
				{ status: 400 }
			);
		}

		if (!isValidPhoneNumber(phoneNumber)) {
			return json(
				{ error: 'Invalid phone number format. Please use E.164 format (e.g., +1234567890)' },
				{ status: 400 }
			);
		}

		// Create Supabase client
		const supabase = createSupabaseServerClient(event);

		// Send SMS using Supabase Auth (this handles everything internally)
		const { error: smsError } = await supabase.auth.signInWithOtp({
			phone: phoneNumber,
			options: {
				channel: 'sms',
				shouldCreateUser: false // We handle user creation manually
			}
		});

		if (smsError) {
			console.error('SMS sending error:', smsError);
			return json(
				{ error: smsError.message || 'Failed to send SMS. Please try again.' },
				{ status: 500 }
			);
		}

		return json({
			success: true,
			message: 'Verification code sent successfully'
		});

	} catch (error) {
		console.error('Send SMS error:', error);
		return json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}