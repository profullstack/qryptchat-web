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

		// Get verification record
		const { data: verification, error: verifyError } = await supabase
			.from('phone_verifications')
			.select('*')
			.eq('phone_number', phoneNumber)
			.single();

		if (verifyError || !verification) {
			return json(
				{ error: 'No verification request found for this phone number' },
				{ status: 404 }
			);
		}

		// Check if code has expired
		if (new Date() > new Date(verification.expires_at)) {
			return json(
				{ error: 'Verification code has expired' },
				{ status: 400 }
			);
		}

		// Check if too many attempts
		if (verification.attempts >= 3) {
			return json(
				{ error: 'Too many verification attempts. Please request a new code.' },
				{ status: 429 }
			);
		}

		// Check if code matches
		if (verification.verification_code !== verificationCode) {
			// Increment attempts
			await supabase
				.from('phone_verifications')
				.update({ attempts: verification.attempts + 1 })
				.eq('phone_number', phoneNumber);

			return json(
				{ error: 'Invalid verification code' },
				{ status: 400 }
			);
		}

		// Mark verification as completed
		await supabase
			.from('phone_verifications')
			.update({ verified: true })
			.eq('phone_number', phoneNumber);

		// Check if user already exists
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

		// Create session using Supabase Auth
		const { data: authData, error: authError } = await supabase.auth.signInWithOtp({
			phone: phoneNumber,
			options: {
				shouldCreateUser: false // We handle user creation manually
			}
		});

		if (authError) {
			console.error('Auth error:', authError);
			// Continue without auth session for now
		}

		// Clean up verification record
		await supabase
			.from('phone_verifications')
			.delete()
			.eq('phone_number', phoneNumber);

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