/**
 * @fileoverview API endpoint for sending SMS verification codes
 * Handles phone number verification using Twilio SMS service
 */

import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import twilio from 'twilio';
import { 
	TWILIO_ACCOUNT_SID, 
	TWILIO_AUTH_TOKEN, 
	TWILIO_PHONE_NUMBER 
} from '$env/static/private';

// Initialize Twilio client
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/**
 * Generate a 6-digit verification code
 * @returns {string}
 */
function generateVerificationCode() {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

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
 * POST /api/auth/send-sms
 * Send SMS verification code to phone number
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function POST(event) {
	const { request, cookies } = event;
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
				{ error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)' },
				{ status: 400 }
			);
		}

		// Create Supabase client
		const supabase = createSupabaseServerClient(event);

		// Generate verification code
		const verificationCode = generateVerificationCode();
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

		// Store verification code in database
		const { error: dbError } = await supabase
			.from('phone_verifications')
			.upsert({
				phone_number: phoneNumber,
				verification_code: verificationCode,
				expires_at: expiresAt.toISOString(),
				attempts: 0,
				verified: false,
				created_at: new Date().toISOString()
			}, {
				onConflict: 'phone_number'
			});

		if (dbError) {
			console.error('Database error:', dbError);
			return json(
				{ error: 'Failed to store verification code' },
				{ status: 500 }
			);
		}

		// Send SMS via Twilio
		try {
			await twilioClient.messages.create({
				body: `Your QryptChat verification code is: ${verificationCode}. This code expires in 10 minutes.`,
				from: TWILIO_PHONE_NUMBER,
				to: phoneNumber
			});

			return json({
				success: true,
				message: 'Verification code sent successfully',
				expiresAt: expiresAt.toISOString()
			});

		} catch (twilioError) {
			console.error('Twilio error:', twilioError);
			
			// Clean up database entry if SMS failed
			await supabase
				.from('phone_verifications')
				.delete()
				.eq('phone_number', phoneNumber);

			return json(
				{ error: 'Failed to send SMS. Please check your phone number.' },
				{ status: 500 }
			);
		}

	} catch (error) {
		console.error('Send SMS error:', error);
		return json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}