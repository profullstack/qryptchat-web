import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';
import { createClient } from '@supabase/supabase-js';

function getServiceRoleClient() {
	return createServiceRoleClient();
}

// Anon client for JWT validation only
const supabaseClient = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function getBearerToken(authHeader) {
	if (typeof authHeader !== 'string') return null;

	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();

	return token || null;
}

/**
 * Authenticate caller and return their auth user.
 * Accepts either a Bearer token (Authorization header) or Supabase cookies.
 */
async function authenticateUser(request) {
	try {
		const authHeader = request.headers.get('authorization');
		const token = getBearerToken(authHeader);
		if (token) {
			const { data: { user }, error } = await supabaseClient.auth.getUser(token);
			if (!error && user) return { user };
		}

		// Fall back to cookies
		const cookieHeader = request.headers.get('cookie') ?? '';
		const cookies = Object.fromEntries(
			cookieHeader.split(/;\s*/).map(c => {
				const [name, ...rest] = c.split('=');
				return [name, rest.join('=')];
			})
		);

		let accessToken = null;
		for (const [name, value] of Object.entries(cookies)) {
			if (name.includes('auth-token')) {
				try {
					const raw = value.startsWith('base64-')
						? Buffer.from(value.slice(7), 'base64').toString('utf-8')
						: decodeURIComponent(value);
					const parsed = JSON.parse(raw);
					if (parsed.access_token) { accessToken = parsed.access_token; break; }
				} catch {}
			}
		}
		if (!accessToken) return { user: null, error: 'No authentication found' };

		const { data: { user }, error } = await supabaseClient.auth.getUser(accessToken);
		if (error || !user) return { user: null, error: 'Invalid token' };
		return { user };
	} catch (err) {
		return { user: null, error: err.message };
	}
}

export async function GET(request) {
	const url = new URL(request.url);
	try {
		// Require authentication: callers may only fetch their OWN salt.
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Look up the authenticated user's own record instead of an arbitrary phone number.
		const { data, error } = await getServiceRoleClient()
			.from('users')
			.select('salt')
			.eq('auth_user_id', user.id)
			.single();

		if (error) {
			return NextResponse.json({ salt: null });
		}

		return NextResponse.json({ salt: data?.salt ?? null });
	} catch (error) {
		console.error('Salt GET error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}


export async function POST(request) {
	try {
		// Require authentication: callers may only set their OWN salt.
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { salt } = await request.json();
		if (!salt) {
			return NextResponse.json({ error: 'Missing salt' }, { status: 400 });
		}

		// Verify the authenticated user has a record and look up their phone.
		const { data: existing } = await getServiceRoleClient()
			.from('users')
			.select('salt, phone_number')
			.eq('auth_user_id', user.id)
			.single();

		if (!existing) {
			return NextResponse.json({ error: 'User record not found' }, { status: 404 });
		}

		// Only store salt if user doesn't already have one (idempotent).
		if (existing.salt) {
			return NextResponse.json({ salt: existing.salt, existing: true });
		}

		const { error } = await getServiceRoleClient()
			.from('users')
			.update({ salt })
			.eq('auth_user_id', user.id);

		if (error) {
			console.error('Salt POST update error:', error);
			return NextResponse.json({ error: 'Failed to store salt' }, { status: 500 });
		}

		return NextResponse.json({ salt, existing: false });
	} catch (error) {
		console.error('Salt POST error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
