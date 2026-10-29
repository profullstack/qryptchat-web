// Backup PIN API endpoint
// Handles setting and checking the user's backup PIN hash

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAuthCookieName } from '@/lib/supabase/auth-cookie.js';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';
import { PIN_ALGORITHM, resolveInternalUserId as resolveUserId } from '@/lib/auth/backup-pin.js';

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
 * Retired. Key backups are now sealed in the browser under a passphrase and a
 * recovery key (seal v2), so a new PIN would protect nothing; a stored hash of a
 * short PIN is only an offline oracle. Legacy PIN rows are still checked by the
 * key-backup route until LEGACY_KEY_MIGRATION=off, and deleted on upgrade.
 */
export async function POST(request) {
	const { user, error: authError } = await authenticateUser(request);
	if (authError || !user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	return NextResponse.json(
		{ error: 'Backup PINs are retired. Back up your keys with a passphrase instead.', code: 'PIN_RETIRED' },
		{ status: 410 }
	);
}
