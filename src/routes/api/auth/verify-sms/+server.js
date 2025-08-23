/**
 * @fileoverview API endpoint for verifying SMS codes and creating user accounts
 * Handles SMS code verification and user registration/login
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
 * POST /api/auth/verify-sms
 * Verify SMS code and create/login user
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function POST(event) {
	const { request } = event;
	
	try {
		const { phoneNumber, verificationCode, username, displayName } = await request.json();

		// Validate input
		if (!phoneNumber || !verificationCode) {
			return json(
				{ error: 'Phone number and verification code are required' },
				{ status: 400 }
			);
		}

		if (!isValidPhoneNumber(phoneNumber)) {
			return json(
				{ error: 'Invalid phone number format' },
				{ status: 400 }
			);
		}

		if (!/^\d{6}$/.test(verificationCode)) {
			return json(
				{ error: 'Verification code must be 6 digits' },
				{ status: 400 }
			);
		}

		// Create Supabase client
		const supabase = createSupabaseServerClient(event);

		// Verify the OTP using Supabase Auth
		const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
			phone: phoneNumber,
			token: verificationCode,
			type: 'sms'
		});

		if (verifyError) {
			console.error('OTP verification error:', verifyError);
			return json(
				{ error: verifyError.message || 'Invalid verification code' },
				{ status: 400 }
			);
		}

		if (!verifyData.user) {
			return json(
				{ error: 'Verification failed' },
				{ status: 400 }
			);
		}

		// Check if user already exists in our custom users table
		const { data: existingUser } = await supabase
			.from('users')
			.select('*')
			.eq('phone_number', phoneNumber)
			.single();

		let user;
		let isNewUser = false;

		if (existingUser) {
			// User exists, just sign them in
			user = existingUser;
		} else {
			// Create new user
			if (!username) {
				return json(
					{ error: 'Username is required for new users' },
					{ status: 400 }
				);
			}

			// Check if username is already taken
			const { data: usernameCheck } = await supabase
				.from('users')
				.select('id')
				.eq('username', username)
				.single();

			if (usernameCheck) {
				return json(
					{ error: 'Username is already taken' },
					{ status: 409 }
				);
			}

			// Create user record
			const { data: newUser, error: createError } = await supabase
				.from('users')
				.insert({
					phone_number: phoneNumber,
					username,
					display_name: displayName || username,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.select()
				.single();

			if (createError) {
				console.error('User creation error:', createError);
				return json(
					{ error: 'Failed to create user account' },
					{ status: 500 }
				);
			}

			user = newUser;
			isNewUser = true;
		}

		return json({
			success: true,
			user: {
				id: user.id,
				username: user.username,
				displayName: user.display_name,
				phoneNumber: user.phone_number,
				avatarUrl: user.avatar_url,
				createdAt: user.created_at
			},
			isNewUser,
			message: isNewUser ? 'Account created successfully' : 'Signed in successfully'
		});

	} catch (error) {
		console.error('Verify SMS error:', error);
		return json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}