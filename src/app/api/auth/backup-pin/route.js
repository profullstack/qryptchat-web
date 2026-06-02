// Backup PIN API endpoint
// Handles setting and checking the user's backup PIN hash

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';

let supabaseServiceRole = null;
function getServiceRoleClient() {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createServiceRoleClient();
	}
	return supabaseServiceRole;
}

const supabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Authenticate user from request cookies
 * @param {Request} request
 * @returns {Promise<{user?: any, error?: string}>}
 */
async function authenticateUser(request) {
	try {
		// Try Authorization header first (used during registration)
		const authHeader = request.headers.get('authorization');
		if (authHeader?.startsWith('Bearer ')) {
			const token = authHeader.substring(7);
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
			cookieHeader.split('; ').map(cookie => {
				const [name, value] = cookie.split('=');
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

/**
 * Hash a PIN using SHA-256
 * @param {string} pin
 * @returns {Promise<string>} hex-encoded hash
 */
async function hashPin(pin) {
	const encoder = new TextEncoder();
	const data = encoder.encode(pin);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * GET /api/auth/backup-pin
 * Check if the authenticated user has a backup PIN set
 */
export async function GET({ request }) {
	try {
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { data, error } = await getServiceRoleClient()
			.from('users')
			.select('backup_pin_hash')
			.eq('id', user.id)
			.single();

		if (error) {
			console.error('Error checking backup PIN:', error);
			return NextResponse.json({ error: 'Failed to check backup PIN' }, { status: 500 });
		}

		return NextResponse.json({ hasPin: !!data?.backup_pin_hash });
	} catch (error) {
		console.error('Error in GET /api/auth/backup-pin:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * POST /api/auth/backup-pin
 * Set or update the backup PIN for the authenticated user
 */
export async function POST({ request }) {
	try {
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { pin } = await request.NextResponse.json();

		if (!pin || typeof pin !== 'string' || pin.length < 6 || pin.length > 12) {
			return NextResponse.json({ error: 'PIN must be 6-12 digits' }, { status: 400 });
		}

		if (!/^\d+$/.test(pin)) {
			return NextResponse.json({ error: 'PIN must contain only digits' }, { status: 400 });
		}

		const pinHash = await hashPin(pin);

		const { error } = await getServiceRoleClient()
			.from('users')
			.update({ backup_pin_hash: pinHash })
			.eq('id', user.id);

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
