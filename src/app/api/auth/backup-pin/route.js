// Backup PIN API endpoint
// Handles setting and checking the user's backup PIN hash

import { NextResponse } from 'next/server';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';

// node:crypto is required for scrypt, so pin this route to the Node runtime.
export const runtime = 'nodejs';

const scrypt = promisify(scryptCallback);

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

		if (cookies['sb-xydzwxwsbgmznthiiscl-auth-token']) {
			try {
				let tokenData = cookies['sb-xydzwxwsbgmznthiiscl-auth-token'];
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

// scrypt work factors. N=16384/r=8/p=1 is the Node default and costs ~16MB and
// tens of milliseconds per derivation -- enough to make an offline sweep of the
// 6-12 digit PIN keyspace impractical per user, and the per-user salt means
// there is no shared work across users.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
export const PIN_ALGORITHM = `scrypt-n${SCRYPT_N}-r${SCRYPT_R}-p${SCRYPT_P}`;

/**
 * Derive a PIN hash using scrypt and a per-user random salt.
 *
 * Replaces the previous unsalted `crypto.subtle.digest('SHA-256', pin)`, which
 * a rainbow table over the numeric PIN keyspace reversed instantly once the
 * hash column was readable (GHSA-jpfm-vrpc-p6rr).
 *
 * @param {string} pin
 * @param {string} [saltHex] existing salt, hex-encoded; a new one is generated when omitted
 * @returns {Promise<{hash: string, salt: string, algorithm: string}>}
 */
async function hashPin(pin, saltHex) {
	const salt = saltHex ?? randomBytes(SCRYPT_SALT_BYTES).toString('hex');
	const derived = /** @type {Buffer} */ (
		await scrypt(pin, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
	);
	return { hash: derived.toString('hex'), salt, algorithm: PIN_ALGORITHM };
}

/**
 * Resolve the internal users.id for a Supabase Auth user.
 * @param {{id: string}} user
 * @returns {Promise<{userId?: string, error?: string}>}
 */
async function resolveInternalUserId(user) {
	const { data, error } = await getServiceRoleClient()
		.from('users')
		.select('id')
		.eq('auth_user_id', user.id)
		.single();

	if (error || !data?.id) {
		return { error: error?.message ?? 'User record not found' };
	}

	return { userId: data.id };
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

		const { pin } = body;

		if (!pin || typeof pin !== 'string' || pin.length < 6 || pin.length > 12) {
			return NextResponse.json({ error: 'PIN must be 6-12 digits' }, { status: 400 });
		}

		if (!/^\d+$/.test(pin)) {
			return NextResponse.json({ error: 'PIN must contain only digits' }, { status: 400 });
		}

		const { userId, error: lookupError } = await resolveInternalUserId(user);
		if (lookupError || !userId) {
			console.error('Error setting backup PIN:', lookupError);
			return NextResponse.json({ error: 'Failed to set backup PIN' }, { status: 500 });
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
