/**
 * @fileoverview "Log in with CoinPay" — OAuth2/OIDC callback.
 *
 * Delegates the OAuth plumbing (state-cookie validation, code exchange,
 * userinfo fetch) to the shared `createCoinPayCallbackHandler` from
 * `@profullstack/stack/coinpay`. The `onSuccess` hook below keeps the
 * qrypt-specific provisioning: find-or-create (via SERVICE ROLE) a Supabase
 * auth user and a public `users` row (account_type 'verified', phone_number
 * NULL), then establish a real Supabase session server-side using the admin
 * magic-link bridge (generateLink -> verifyOtp), which sets the auth cookies
 * on the response.
 *
 * Open to ANYONE. Additive only — does NOT touch the phone/SMS or anon flows.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCoinPayCallbackHandler } from '@profullstack/stack/coinpay';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import {
	getCoinpayConfig,
	getAppOrigin,
	getRedirectUri,
	deriveUniqueUsername
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
 *
 * The one-time state cookie is cleared by the stack callback handler on any
 * Response returned from `onSuccess`.
 * @param {string} appOrigin
 * @param {{access_token:string, refresh_token:string}} session
 * @returns {NextResponse}
 */
function popupSession(appOrigin, session, user) {
	const payload = JSON.stringify({
		type: 'coinpay-session',
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		// expires_at is REQUIRED: the auth store's init() discards any stored
		// session (and qrypt_user) that lacks it, which logged CoinPay users
		// straight back out to /auth on the next load.
		expires_at: session.expires_at,
		expires_in: session.expires_in,
		token_type: session.token_type,
		user: user || null
	}).replace(/</g, '\\u003c');
	const target = JSON.stringify(appOrigin);
	const html = `<!doctype html><meta charset="utf-8"><title>Signed in</title>` +
		`<body style="background:#0b1020;color:#cfe8ff;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0">` +
		`<p>✓ Signed in — you can close this window.</p>` +
		`<script>try{(window.opener||window.parent).postMessage(${payload},${target});}catch(e){}` +
		`setTimeout(function(){try{window.close();}catch(e){}},250);</script></body>`;
	return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
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
	const appOrigin = getAppOrigin(new URL(request.url).origin);
	const { issuer, clientId, clientSecret } = getCoinpayConfig();
	if (!clientId || !clientSecret) {
		console.error('coinpay/callback: client credentials not configured');
		return redirectError(appOrigin, 'coinpay_unavailable');
	}

	return createCoinPayCallbackHandler({
		clientId,
		clientSecret,
		issuer,
		redirectUri: getRedirectUri(appOrigin),
		appOrigin,
		onSuccess: async ({ claims, cookie }) => {
			// popup flag stashed by the login route's extraState.
			const popup = !!cookie.popup;

			const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
			const coinpaySub = claims.sub;
			if (!email) {
				console.error('coinpay/callback: userinfo did not include an email');
				return `${appOrigin}/auth?error=coinpay_no_email`;
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
						return `${appOrigin}/auth?error=coinpay_provision_failed`;
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

			let userRow = existingUser || null;
			if (!userRow) {
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

				const { data: inserted, error: insertError } = await serviceSupabase.from('users').insert({
					auth_user_id: authUser.id,
					phone_number: null,
					account_type: 'verified',
					username,
					display_name: displayName,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}).select('*').single();
				if (insertError && insertError.code !== PG_UNIQUE_VIOLATION) {
					console.error('coinpay/callback: user row insert failed', insertError);
					return `${appOrigin}/auth?error=coinpay_provision_failed`;
				}
				userRow = inserted || null;
				if (!userRow) {
					// Unique-violation race (another request created it) → re-fetch.
					const { data: refetched } = await serviceSupabase
						.from('users').select('*').eq('auth_user_id', authUser.id).single();
					userRow = refetched || null;
				}
			}

			// --- c) Establish a real Supabase session via admin magic-link bridge ---
			const { data: linkData, error: linkError } = await serviceSupabase.auth.admin.generateLink({
				type: 'magiclink',
				email
			});
			if (linkError || !linkData?.properties?.hashed_token) {
				console.error('coinpay/callback: generateLink failed', linkError);
				return `${appOrigin}/auth?error=coinpay_session_failed`;
			}

			// Use the cookie-wired server client so verifyOtp persists session cookies.
			const supabase = await createSupabaseServerClient();
			const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
				type: 'magiclink',
				token_hash: linkData.properties.hashed_token
			});
			if (verifyError || !sessionData?.session) {
				console.error('coinpay/callback: verifyOtp failed', verifyError);
				return `${appOrigin}/auth?error=coinpay_session_failed`;
			}

			// Popup (embed) flow: postMessage the session + user back to the opener.
			if (popup) {
				return popupSession(appOrigin, sessionData.session, userRow);
			}

			// Build the redirect, then mirror the session cookies set by the server
			// client onto the outgoing response. The stack handler clears the
			// one-time state cookie on it.
			const response = NextResponse.redirect(`${appOrigin}/chat`);

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
		}
	})(request);
}
