// Backup PIN API endpoint
// Handles setting and checking the user's backup PIN hash

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAuthCookieName } from '@/lib/supabase/auth-cookie.js';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';
import { checkPin, hashPin, PIN_ALGORITHM, PIN_PATTERN, PIN_RULE, resolveInternalUserId as resolveUserId } from '@/lib/auth/backup-pin.js';

// node:crypto is required for scrypt, so pin this route to the Node runtime.
export const runtime = 'nodejs';

let supabaseServiceRole = null;
function getServiceRoleClient() {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createServiceRoleClient();
	}
	return supabaseServiceRole;
}

const supabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function getBearerToken(authHeader) {
	if (typeof authHeader !== 'string') return null;

	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();

	return token || null;
}

/**
 * Authenticate user from request cookies
 * @param {Request} request
 * @returns {Promise<{user?: any, error?: string}>}
 */
async function authenticateUser(request) {
	try {
		// Try Authorization header first (used during registration)
		const authHeader = request.headers.get('authorization');
		const token = getBearerToken(authHeader);
		if (token) {
			const { data: { user }, error } = await supabaseClient.auth.getUser(token);
			if (!error && user) {
				return { user };
			}
		}

		// Fall back to cookies
		const cookieHeader = request.headers.get('cookie');
		if (!cookieHeader) {
			return { error: 'No authentication found' };
		}

		const cookies = Object.fromEntries(
			cookieHeader.split(/;\s*/).map(cookie => {
				const separator = cookie.indexOf('=');
				const name = separator === -1 ? cookie : cookie.slice(0, separator);
				const value = separator === -1 ? '' : cookie.slice(separator + 1);
				return [name, decodeURIComponent(value)];
			})
		);

		let accessToken = null;

		if (cookies[supabaseAuthCookieName()]) {
			try {
				let tokenData = cookies[supabaseAuthCookieName()];
				if (tokenData.startsWith('base64-')) {
					tokenData = Buffer.from(tokenData.substring(7), 'base64').toString('utf-8');
				}
				const parsed = JSON.parse(tokenData);
				accessToken = parsed.access_token;
			} catch (error) {
				console.log('Failed to parse Supabase auth cookie:', error.message);
			}
		}

		if (!accessToken && cookies.session) {
			const sessionToken = cookies.session;
			if (sessionToken.split('.').length === 3) {
				accessToken = sessionToken;
			}
		}

		if (!accessToken) {
			return { error: 'No access token found' };
		}

		const { data: { user }, error } = await supabaseClient.auth.getUser(accessToken);

		if (error || !user) {
			return { error: `Invalid token: ${error?.message}` };
		}

		return { user };
	} catch (error) {
		return { error: `Authentication error: ${error.message}` };
	}
}

export { PIN_ALGORITHM };

async function resolveInternalUserId(user) {
	return resolveUserId(getServiceRoleClient(), user);
}

/**
 * GET /api/auth/backup-pin
 * Check if the authenticated user has a backup PIN set
 */
export async function GET(request) {
	try {
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { userId, error: lookupError } = await resolveInternalUserId(user);
		if (lookupError || !userId) {
			console.error('Error checking backup PIN:', lookupError);
			return NextResponse.json({ error: 'Failed to check backup PIN' }, { status: 500 });
		}

		// PIN material lives in user_backup_pins, which only the service role can
		// reach. A row's existence is what marks a PIN as set -- rows migrated from
		// the old unsalted column carry NULL hashes on purpose.
		const { data, error } = await getServiceRoleClient()
			.from('user_backup_pins')
			.select('user_id')
			.eq('user_id', userId)
			.maybeSingle();

		if (error) {
			console.error('Error checking backup PIN:', error);
			return NextResponse.json({ error: 'Failed to check backup PIN' }, { status: 500 });
		}

		return NextResponse.json({ hasPin: !!data });
	} catch (error) {
		console.error('Error in GET /api/auth/backup-pin:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * POST /api/auth/backup-pin
 * Set or update the backup PIN for the authenticated user
 */
export async function POST(request) {
	try {
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		let body;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
		}

		const { pin, currentPin } = body;

		if (!pin || typeof pin !== 'string' || pin.length < 4 || pin.length > 12) {
			return NextResponse.json({ error: PIN_RULE }, { status: 400 });
		}

		if (!PIN_PATTERN.test(pin)) {
			return NextResponse.json({ error: 'PIN must contain only digits' }, { status: 400 });
		}

		const { userId, error: lookupError } = await resolveInternalUserId(user);
		if (lookupError || !userId) {
			console.error('Error setting backup PIN:', lookupError);
			return NextResponse.json({ error: 'Failed to set backup PIN' }, { status: 500 });
		}

		// Replacing a PIN the server can verify takes the current one. Otherwise a
		// stolen session could set its own PIN and walk through the restore gate.
		const current = await checkPin(getServiceRoleClient(), userId, typeof currentPin === 'string' ? currentPin : '');
		if (current.status === 'error') {
			console.error('Error checking backup PIN:', current.error);
			return NextResponse.json({ error: 'Failed to set backup PIN' }, { status: 500 });
		}
		if (current.status === 'locked' || (current.status === 'wrong' && current.retryAfter)) {
			const retryAfter = current.retryAfter;
			return NextResponse.json(
				{ error: 'Too many wrong PINs. Try again later.', code: 'PIN_LOCKED', retryAfter },
				{ status: 429, headers: { 'Retry-After': String(retryAfter) } }
			);
		}
		if (current.status === 'required') {
			return NextResponse.json({ error: 'Enter your current PIN to change it', code: 'PIN_REQUIRED' }, { status: 403 });
		}
		if (current.status === 'wrong') {
			return NextResponse.json({ error: 'Current PIN is wrong', code: 'PIN_WRONG', remaining: current.remaining }, { status: 403 });
		}

		const { hash, salt, algorithm } = await hashPin(pin);

		const { error } = await getServiceRoleClient()
			.from('user_backup_pins')
			.upsert({
				user_id: userId,
				pin_hash: hash,
				pin_salt: salt,
				algorithm,
				updated_at: new Date().toISOString()
			}, { onConflict: 'user_id' });

		if (error) {
			console.error('Error setting backup PIN:', error);
			return NextResponse.json({ error: 'Failed to set backup PIN' }, { status: 500 });
		}

		console.log(`🔑 Backup PIN set for user ${user.id}`);
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error in POST /api/auth/backup-pin:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
