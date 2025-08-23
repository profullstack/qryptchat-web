/**
 * @fileoverview API endpoint for verifying SMS codes and creating user accounts
 * Handles SMS code verification and user registration/login
 */

import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { SMSDebugLogger, formatSMSError } from '$lib/utils/sms-debug.js';

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
	const logger = new SMSDebugLogger();
	
	try {
		const { phoneNumber, verificationCode, username, displayName, useSession } = await request.json();
		const authHeader = request.headers.get('authorization');
		
		logger.info('SMS verification request received', {
			phoneNumber: phoneNumber ? `${phoneNumber.substring(0, 3)}***${phoneNumber.substring(phoneNumber.length - 2)}` : null,
			hasCode: !!verificationCode,
			codeLength: verificationCode?.length,
			hasUsername: !!username,
			useSession: !!useSession,
			hasAuthHeader: !!authHeader,
			userAgent: request.headers.get('user-agent'),
			ip: event.getClientAddress()
		});

		// Check if this is a session-based request (profile completion)
		if (useSession && authHeader) {
			logger.info('Processing session-based profile completion');
			
			// Validate input for session-based request
			if (!phoneNumber || !username) {
				logger.error('Missing required fields for session-based request', { phoneNumber: !!phoneNumber, username: !!username });
				return json(
					{ error: 'Phone number and username are required' },
					{ status: 400 }
				);
			}
			
			// Create Supabase client and set the session from JWT
			const supabase = createSupabaseServerClient(event);
			const token = authHeader.replace('Bearer ', '');
			
			try {
				// Verify the JWT token and get user info
				const { data: { user }, error: userError } = await supabase.auth.getUser(token);
				
				if (userError || !user) {
					logger.error('Invalid or expired session token', { error: userError });
					return json(
						{ error: 'Session expired. Please verify your phone number again.' },
						{ status: 401 }
					);
				}
				
				logger.info('Session validated successfully', { userId: user.id, userPhone: user.phone });
				
				// Proceed with account creation using the authenticated user
				const verifyData = { user, session: { access_token: token } };
				const verifyError = null;
				
				// Continue with the existing account creation logic...
				// (The rest of the function will handle this)
				
			} catch (sessionError) {
				logger.error('Session validation failed', { error: sessionError });
				return json(
					{ error: 'Invalid session. Please verify your phone number again.' },
					{ status: 401 }
				);
			}
		} else {
			// Original OTP verification flow
			// Validate input
			if (!phoneNumber || !verificationCode) {
				logger.error('Missing required fields', { phoneNumber: !!phoneNumber, verificationCode: !!verificationCode });
				return json(
					{ error: 'Phone number and verification code are required' },
					{ status: 400 }
				);
			}
		}

		// Validate phone number format for all requests
		if (!isValidPhoneNumber(phoneNumber)) {
			logger.error('Invalid phone number format', { phoneNumber });
			return json(
				{
					error: 'Invalid phone number format',
					suggestion: 'Ensure your phone number is in E.164 format (e.g., +1234567890)'
				},
				{ status: 400 }
			);
		}

		// Create Supabase client
		const supabase = createSupabaseServerClient(event);
		
		let verifyData;
		let verifyError;

		// Check if this is a session-based request (profile completion)
		if (useSession && authHeader) {
			logger.info('Processing session-based profile completion');
			
			const token = authHeader.replace('Bearer ', '');
			
			try {
				// Validate the JWT token by getting user info
				const { data: { user }, error: userError } = await supabase.auth.getUser(token);
				
				if (userError || !user) {
					logger.error('Invalid or expired session token', { error: userError });
					return json(
						{ error: 'Session expired. Please verify your phone number again.' },
						{ status: 401 }
					);
				}
				
				logger.info('Session validated successfully', {
					userId: user.id,
					userPhone: user.phone
				});
				
				// Use the authenticated user data
				verifyData = {
					user,
					session: { access_token: token }
				};
				verifyError = null;
				
			} catch (sessionError) {
				logger.error('Session validation failed', { error: sessionError });
				return json(
					{ error: 'Invalid session. Please verify your phone number again.' },
					{ status: 401 }
				);
			}
		} else {
			// Original OTP verification flow
			if (!/^\d{6}$/.test(verificationCode)) {
				logger.error('Invalid verification code format', {
					codeLength: verificationCode?.length,
					codePattern: verificationCode?.replace(/\d/g, 'X')
				});
				return json(
					{
						error: 'Verification code must be 6 digits',
						suggestion: 'Enter the 6-digit code you received via SMS'
					},
					{ status: 400 }
				);
			}

			logger.info('Attempting to verify OTP with Supabase Auth');

			// Verify the OTP using Supabase Auth
			const otpResult = await supabase.auth.verifyOtp({
				phone: phoneNumber,
				token: verificationCode,
				type: 'sms'
			});
			
			verifyData = otpResult.data;
			verifyError = otpResult.error;
		}

		if (verifyError) {
			const errorInfo = formatSMSError(verifyError, {
				phoneNumber,
				action: 'verify_sms',
				environment: process.env.NODE_ENV
			});
			
			logger.error('OTP verification failed', errorInfo);
			
			// Log to console for production debugging
			console.error('OTP verification error:', {
				...errorInfo,
				logs: logger.getLogsAsString()
			});

			// Determine error type and provide specific user guidance
			let userMessage = 'Invalid verification code';
			let statusCode = 400;
			let errorCode = 'VERIFICATION_FAILED';
			let canRetry = true;
			let suggestedAction = 'Please try again';
			
			if (verifyError.message?.includes('expired') || verifyError.message?.includes('Token has expired')) {
				userMessage = 'Your verification code has expired';
				errorCode = 'CODE_EXPIRED';
				canRetry = false;
				suggestedAction = 'Please request a new verification code';
			} else if (verifyError.message?.includes('invalid') || verifyError.message?.includes('Token has expired or is invalid')) {
				// This covers both expired and invalid tokens from the logs
				userMessage = 'The verification code is incorrect or has expired';
				errorCode = 'CODE_INVALID_OR_EXPIRED';
				canRetry = false;
				suggestedAction = 'Please check the code or request a new one';
			} else if (verifyError.message?.includes('Too many requests')) {
				userMessage = 'Too many verification attempts';
				errorCode = 'TOO_MANY_ATTEMPTS';
				statusCode = 429;
				canRetry = false;
				suggestedAction = 'Please wait a few minutes before trying again';
			} else if (verifyError.message?.includes('rate limit')) {
				userMessage = 'Rate limit exceeded';
				errorCode = 'RATE_LIMITED';
				statusCode = 429;
				canRetry = false;
				suggestedAction = 'Please wait before requesting a new code';
			}

			return json(
				{
					error: userMessage,
					code: errorCode,
					canRetry,
					suggestedAction,
					...(process.env.NODE_ENV === 'development' && {
						debug: errorInfo,
						logs: logger.getLogs()
					})
				},
				{ status: statusCode }
			);
		}

		if (!verifyData.user) {
			logger.error('Verification succeeded but no user data returned');
			return json(
				{
					error: 'Verification failed - no user data',
					code: 'NO_USER_DATA'
				},
				{ status: 400 }
			);
		}

		logger.info('OTP verification successful', {
			supabaseUserId: verifyData.user.id,
			userPhone: verifyData.user.phone
		});

		// Create service role client for database operations (bypasses RLS)
		const serviceSupabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});
		
		// Check if user already exists in our custom users table
		logger.info('Checking for existing user in database');
		const { data: existingUser, error: userLookupError } = await serviceSupabase
			.from('users')
			.select('*')
			.eq('phone_number', phoneNumber)
			.single();

		if (userLookupError && userLookupError.code !== 'PGRST116') { // PGRST116 = no rows returned
			logger.error('Database lookup error', { error: userLookupError });
			console.error('User lookup error:', userLookupError);
		}

		let user;
		let isNewUser = false;

		if (existingUser) {
			// User exists, just sign them in
			logger.info('Existing user found, signing in', { userId: existingUser.id });
			user = existingUser;
		} else {
			// New user - check if username provided
			if (!username) {
				// Username not provided - return special response indicating username needed
				// But keep the session active so user can complete registration
				logger.info('New user detected, username required');
				return json(
					{
						success: false,
						requiresUsername: true,
						message: 'Username is required for new users',
						session: verifyData.session, // Keep session for account creation
						...(process.env.NODE_ENV === 'development' && {
							logs: logger.getLogs()
						})
					},
					{ status: 200 }
				);
			}

			// Username provided - create the account using the verified session
			logger.info('Creating new user account with verified session');

			// Check if username is already taken
			logger.info('Checking username availability', { username });
			const { data: usernameCheck, error: usernameError } = await serviceSupabase
				.from('users')
				.select('id')
				.eq('username', username)
				.single();

			if (usernameError && usernameError.code !== 'PGRST116') {
				logger.error('Username check error', { error: usernameError });
				console.error('Username check error:', usernameError);
			}

			if (usernameCheck) {
				logger.error('Username already taken', { username });
				return json(
					{
						success: false,
						error: 'Username is already taken',
						suggestion: 'Please choose a different username',
						session: verifyData.session, // Keep session for retry
						...(process.env.NODE_ENV === 'development' && {
							logs: logger.getLogs()
						})
					},
					{ status: 409 }
				);
			}

			// Create user record
			logger.info('Creating user record in database');
			const { data: newUser, error: createError } = await serviceSupabase
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
				const errorInfo = formatSMSError(createError, {
					phoneNumber,
					username,
					action: 'create_user',
					environment: process.env.NODE_ENV
				});
				
				logger.error('User creation failed', errorInfo);
				
				console.error('User creation error:', {
					...errorInfo,
					logs: logger.getLogsAsString()
				});

				return json(
					{
						error: 'Failed to create user account',
						code: 'USER_CREATION_FAILED',
						...(process.env.NODE_ENV === 'development' && {
							debug: errorInfo,
							logs: logger.getLogs()
						})
					},
					{ status: 500 }
				);
			}

			user = newUser;
			isNewUser = true;
			logger.info('User account created successfully', { userId: newUser.id });
		}

		logger.info('SMS verification completed successfully', {
			userId: user.id,
			isNewUser,
			username: user.username
		});

		// Log success for monitoring
		console.log('SMS verification successful:', {
			phoneNumber: `${phoneNumber.substring(0, 3)}***${phoneNumber.substring(phoneNumber.length - 2)}`,
			userId: user.id,
			isNewUser,
			timestamp: new Date().toISOString(),
			environment: process.env.NODE_ENV
		});

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
			session: verifyData.session, // Include the Supabase session with JWT tokens
			isNewUser,
			message: isNewUser ? 'Account created successfully' : 'Signed in successfully',
			...(process.env.NODE_ENV === 'development' && {
				logs: logger.getLogs()
			})
		});

	} catch (error) {
		const errorInfo = formatSMSError(error, {
			action: 'verify_sms',
			environment: process.env.NODE_ENV
		});
		
		logger.error('Verify SMS exception', errorInfo);
		
		// Log to console for production debugging
		console.error('Verify SMS error:', {
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