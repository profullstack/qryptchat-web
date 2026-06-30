/**
 * @fileoverview "Log in with CoinPay" — OAuth2/OIDC callback.
 *
 * Validates the `state` cookie, exchanges the authorization code for tokens,
 * fetches userinfo, then provisions (via SERVICE ROLE) a Supabase auth user and
 * a public `users` row (account_type 'verified', phone_number NULL). A real
 * Supabase session is established server-side using the admin magic-link bridge
 * (generateLink -> verifyOtp), which sets the auth cookies on the response.
 *
 * Open to ANYONE. Additive only — does NOT touch the phone/SMS or anon flows.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import {
	getCoinpayConfig,
	getAppOrigin,
	getRedirectUri,
	validateState,
	exchangeCodeForToken,
	fetchUserinfo,
	deriveUniqueUsername,
	COINPAY_STATE_COOKIE
} from '@/lib/auth/coinpay.js';

/** Postgres unique-violation error code. */
const PG_UNIQUE_VIOLATION = '23505';
/** "no rows returned" from PostgREST .single(). */
const PG_NO_ROWS = 'PGRST116';

/**
 * Build a service-role Supabase client (bypasses RLS). Mirrors verify-sms.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createServiceClient() {
	return createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL,
		process.env.SUPABASE_SERVICE_ROLE_KEY,
		{ auth: { autoRefreshToken: false, persistSession: false } }
	);
}

/**
 * Redirect to /auth with an error code (never leak token/secret details).
 * @param {string} appOrigin
 * @param {string} code
 * @returns {NextResponse}
 */
function redirectError(appOrigin, code) {
	return NextResponse.redirect(`${appOrigin}/auth?error=${encodeURIComponent(code)}`);
}

/**
 * Popup-mode result: hand the Supabase session back to the opener via postMessage
 * (the opener sets it client-side with supabase.auth.setSession, exactly like the
 * phone flow), then close. This is what makes CoinPay work inside the in-iframe
 * embed, where session cookies set on a first-party popup don't reach the
 * partitioned iframe.
 * @param {string} appOrigin
 * @param {{access_token:string, refresh_token:string}} session
 * @returns {NextResponse}
 */
function popupSession(appOrigin, session) {
	const payload = JSON.stringify({
		type: 'coinpay-session',
		access_token: session.access_token,
		refresh_token: session.refresh_token
	}).replace(/</g, '\\u003c');
	const target = JSON.stringify(appOrigin);
	const html = `<!doctype html><meta charset="utf-8"><title>Signed in</title>` +
		`<body style="background:#0b1020;color:#cfe8ff;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0">` +
		`<p>✓ Signed in — you can close this window.</p>` +
		`<script>try{(window.opener||window.parent).postMessage(${payload},${target});}catch(e){}` +
		`setTimeout(function(){try{window.close();}catch(e){}},250);</script></body>`;
	const res = new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
	res.cookies.set(COINPAY_STATE_COOKIE, '', {
		httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0
	});
	return res;
}

/**
 * Find an existing Supabase auth user by email (paged scan of admin.listUsers).
 * @param {import('@supabase/supabase-js').SupabaseClient} serviceSupabase
 * @param {string} email
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
async function findAuthUserByEmail(serviceSupabase, email) {
	const target = email.toLowerCase();
	const perPage = 200;
	for (let page = 1; page <= 50; page++) {
		// eslint-disable-next-line no-await-in-loop
		const { data, error } = await serviceSupabase.auth.admin.listUsers({ page, perPage });
		if (error) {
			throw error;
		}
		const match = (data?.users || []).find((u) => (u.email || '').toLowerCase() === target);
		if (match) {
			return match;
		}
		if (!data?.users || data.users.length < perPage) {
			break;
		}
	}
	return null;
}

/**
 * GET /api/auth/coinpay/callback
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
	const url = new URL(request.url);
	const appOrigin = getAppOrigin(url.origin);

	try {
		const oauthError = url.searchParams.get('error');
		if (oauthError) {
			console.error('coinpay/callback: provider returned error', oauthError);
			return redirectError(appOrigin, 'coinpay_denied');
		}

		const code = url.searchParams.get('code');
		const returnedState = url.searchParams.get('state');
		if (!code) {
			return redirectError(appOrigin, 'coinpay_missing_code');
		}

		// --- Validate state against the cookie, then consume it ---
		const stateCookie = request.cookies.get(COINPAY_STATE_COOKIE)?.value;
		let storedState = null;
		let codeVerifier;
		let popup = false;
		if (stateCookie) {
			try {
				const parsed = JSON.parse(stateCookie);
				storedState = parsed.state;
				codeVerifier = parsed.codeVerifier;
				popup = !!parsed.popup;
			} catch {
				storedState = null;
			}
		}
		if (!validateState(returnedState, storedState)) {
			return redirectError(appOrigin, 'coinpay_state_mismatch');
		}

		const { issuer, clientId, clientSecret } = getCoinpayConfig();
		if (!clientId || !clientSecret) {
			console.error('coinpay/callback: client credentials not configured');
			return redirectError(appOrigin, 'coinpay_unavailable');
		}

		const redirectUri = getRedirectUri(appOrigin);

		// --- Exchange code for tokens ---
		const tokens = await exchangeCodeForToken({
			issuer,
			code,
			redirectUri,
			clientId,
			clientSecret,
			codeVerifier
		});

		// --- Fetch userinfo claims ---
		const claims = await fetchUserinfo({ issuer, accessToken: tokens.access_token });
		const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
		const coinpaySub = claims.sub;
		if (!email) {
			console.error('coinpay/callback: userinfo did not include an email');
			return redirectError(appOrigin, 'coinpay_no_email');
		}

		const serviceSupabase = createServiceClient();

		// --- a) Find-or-create Supabase auth user by email ---
		let authUser = await findAuthUserByEmail(serviceSupabase, email);
		if (!authUser) {
			const { data: created, error: createAuthError } =
				await serviceSupabase.auth.admin.createUser({
					email,
					email_confirm: true,
					user_metadata: { coinpay_sub: coinpaySub, provider: 'coinpay' }
				});
			if (createAuthError || !created?.user) {
				// Possible race: another request created it. Re-fetch once.
				authUser = await findAuthUserByEmail(serviceSupabase, email);
				if (!authUser) {
					console.error('coinpay/callback: failed to create auth user', createAuthError);
					return redirectError(appOrigin, 'coinpay_provision_failed');
				}
			} else {
				authUser = created.user;
			}
		}

		// --- b) Find-or-create the public users row ---
		const { data: existingUser, error: lookupError } = await serviceSupabase
			.from('users')
			.select('*')
			.eq('auth_user_id', authUser.id)
			.single();
		if (lookupError && lookupError.code !== PG_NO_ROWS) {
			console.error('coinpay/callback: users lookup error', lookupError);
		}

		if (!existingUser) {
			const username = await deriveUniqueUsername(
				{ name: claims.name, email },
				async (candidate) => {
					const { data } = await serviceSupabase
						.from('users')
						.select('id')
						.ilike('username', candidate)
						.single();
					return !!data;
				}
			);
			const displayName = (typeof claims.name === 'string' && claims.name.trim()) || email.split('@')[0];

			const { error: insertError } = await serviceSupabase.from('users').insert({
				auth_user_id: authUser.id,
				phone_number: null,
				account_type: 'verified',
				username,
				display_name: displayName,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			});
			if (insertError && insertError.code !== PG_UNIQUE_VIOLATION) {
				console.error('coinpay/callback: user row insert failed', insertError);
				return redirectError(appOrigin, 'coinpay_provision_failed');
			}
		}

		// --- c) Establish a real Supabase session via admin magic-link bridge ---
		const { data: linkData, error: linkError } = await serviceSupabase.auth.admin.generateLink({
			type: 'magiclink',
			email
		});
		if (linkError || !linkData?.properties?.hashed_token) {
			console.error('coinpay/callback: generateLink failed', linkError);
			return redirectError(appOrigin, 'coinpay_session_failed');
		}

		// Use the cookie-wired server client so verifyOtp persists session cookies.
		const supabase = await createSupabaseServerClient();
		const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
			type: 'magiclink',
			token_hash: linkData.properties.hashed_token
		});
		if (verifyError || !sessionData?.session) {
			console.error('coinpay/callback: verifyOtp failed', verifyError);
			return redirectError(appOrigin, 'coinpay_session_failed');
		}

		// Popup (embed) flow: postMessage the session back to the opener + close.
		if (popup) {
			return popupSession(appOrigin, sessionData.session);
		}

		// Build the redirect, then mirror the session cookies set by the server
		// client onto the outgoing response and clear the one-time state cookie.
		const response = NextResponse.redirect(`${appOrigin}/chat`);
		response.cookies.set(COINPAY_STATE_COOKIE, '', {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/',
			maxAge: 0
		});

		try {
			const { cookies } = await import('next/headers');
			const cookieStore = await cookies();
			for (const c of cookieStore.getAll()) {
				if (c.name.startsWith('sb-')) {
					response.cookies.set(c.name, c.value, {
						httpOnly: true,
						secure: process.env.NODE_ENV === 'production',
						sameSite: 'lax',
						path: '/'
					});
				}
			}
		} catch (e) {
			console.error('coinpay/callback: copying session cookies failed', e);
		}

		return response;
	} catch (error) {
		console.error('coinpay/callback error:', error);
		return redirectError(appOrigin, 'coinpay_login_failed');
	}
}
