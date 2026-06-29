import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Regular (anon) client used ONLY to validate the caller's JWT. Never use the
// service-role key for auth checks.
const supabaseClient = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Authenticate user from request cookies. Mirrors the check in ../route.js so
 * this admin-scoped endpoint cannot be called anonymously.
 * @param {Request} request
 * @returns {Promise<{user?: any, error?: string}>}
 */
async function authenticateUser(request) {
	try {
		const cookieHeader = request.headers.get('cookie');
		if (!cookieHeader) {
			return { error: 'No cookies found' };
		}

		const cookies = Object.fromEntries(
			cookieHeader.split('; ').map((cookie) => {
				const [name, value] = cookie.split('=');
				return [name, decodeURIComponent(value)];
			})
		);

		let accessToken = null;

		// Supabase-specific auth cookie first
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

		// Fallback to a session cookie that looks like a JWT
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

export async function GET(request) {
	try {
		// SECURITY: require an authenticated session. This endpoint uses the
		// service-role key (which bypasses RLS) to read every user's public key,
		// so without this gate any anonymous caller could enumerate the entire
		// user base (all user_ids). Public keys are non-secret, but the full
		// membership list is. The legitimate caller (key-sync-service) is always
		// an authenticated client.
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Service role client for admin access to all user data
		const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		// Get all users with public keys
		const { data: users, error } = await supabase
			.from('user_public_keys')
			.select('user_id, public_key')
			.not('public_key', 'is', null);

		if (error) {
			console.error('Failed to fetch all user keys:', error);
			return NextResponse.json({ error: 'Failed to fetch user keys' }, { status: 500 });
		}

		// Transform the data to match expected format
		const userKeys = users.map(user => ({
			user_id: user.user_id,
			public_key: user.public_key
		}));

		console.log(`📊 Retrieved ${userKeys.length} users with public keys`);
		return NextResponse.json(userKeys);

	} catch (error) {
		console.error('Error in public-keys/all endpoint:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
