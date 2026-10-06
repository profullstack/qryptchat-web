/**
 * @fileoverview "Log in with CoinPay" — OAuth2/OIDC callback.
 *
 * Validates the `state` cookie, exchanges the authorization code for tokens,
 * fetches userinfo, then provisions (via SERVICE ROLE) a Supabase auth user and
 * a public `users` row (account_type 'verified', phone_number NULL), and mints a
 * Supabase session through the admin magic-link bridge.
 *
 * Identity is CoinPay's `sub`, never the email. CoinPay reports
 * `email_verified: false` for every account (it has no verification flow), and
 * linking by an unverified address would let whoever typed someone else's email
 * into CoinPay take over that person's qrypt.chat account. So a CoinPay login
 * finds the account that carries its `sub`, or makes one addressed
 * `<sub>@coinpay.qrypt.chat`; the address CoinPay sent is kept as metadata only.
 *
 * The app keys "signed in" off localStorage (qrypt_session / qrypt_user), not
 * cookies, so the session always goes to the page:
 *   popup    postMessage to the opener (works inside the iframe embed)
 *   redirect /auth#coinpay=<base64url> (a fragment never reaches a server log)
 * Errors go the same two ways, so the user always sees why.
 *
 * Open to ANYONE. Additive only — does NOT touch the phone/SMS or anon flows.
 */

import { NextResponse } from 'next/server';
import {
	validateCoinPayState,
	exchangeCoinPayCode,
	fetchCoinPayUserinfo,
	COINPAY_STATE_COOKIE
} from '@profullstack/stack/coinpay';
import {
	getCoinpayConfig,
	getAppOrigin,
	getRedirectUri,
	deriveUniqueUsername
} from '@/lib/auth/coinpay.js';
import { mintSession, serviceClient } from '@/lib/auth/cli-auth.js';
import { coinpayEmail, findAuthUserByCoinpaySub, sessionMessage } from '@/lib/auth/coinpay-identity.js';

/** Postgres unique-violation error code. */
const PG_UNIQUE_VIOLATION = '23505';
/** "no rows returned" from PostgREST .single(). */
const PG_NO_ROWS = 'PGRST116';

const clearState = (res) => {
	res.cookies.set(COINPAY_STATE_COOKIE, '', {
		httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0
	});
	return res;
};

/** A tiny page that hands a result to the opener and closes (popup mode). */
function popupPage(appOrigin, message) {
	const payload = JSON.stringify(message).replace(/</g, '\\u003c');
	const target = JSON.stringify(appOrigin);
	const ok = message.type === 'coinpay-session';
	const html = `<!doctype html><meta charset="utf-8"><title>${ok ? 'Signed in' : 'Sign-in failed'}</title>` +
		`<body style="background:#0b1020;color:#cfe8ff;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0">` +
		`<p>${ok ? '✓ Signed in. You can close this window.' : 'Sign-in did not complete. You can close this window.'}</p>` +
		`<script>try{(window.opener||window.parent).postMessage(${payload},${target});}catch(e){}` +
		`setTimeout(function(){try{window.close();}catch(e){}},250);</script></body>`;
	return clearState(new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }));
}

/**
 * GET /api/auth/coinpay/callback
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
	const url = new URL(request.url);
	const appOrigin = getAppOrigin(url.origin);

	let popup = false;
	const fail = (code) =>
		popup
			? popupPage(appOrigin, { type: 'coinpay-error', code })
			: clearState(NextResponse.redirect(`${appOrigin}/auth?error=${encodeURIComponent(code)}`));

	try {
		// --- Validate state against the cookie, then consume it ---
		const stateCookie = request.cookies.get(COINPAY_STATE_COOKIE)?.value;
		let storedState = null;
		let codeVerifier;
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

		const oauthError = url.searchParams.get('error');
		if (oauthError) {
			console.error('coinpay/callback: provider returned error', oauthError);
			return fail('coinpay_denied');
		}

		const code = url.searchParams.get('code');
		if (!code) return fail('coinpay_missing_code');
		if (!validateCoinPayState(url.searchParams.get('state'), storedState)) return fail('coinpay_state_mismatch');

		const { issuer, clientId, clientSecret } = getCoinpayConfig();
		if (!clientId || !clientSecret) {
			console.error('coinpay/callback: client credentials not configured');
			return fail('coinpay_unavailable');
		}

		// --- Exchange code for tokens, then read who this is ---
		const tokens = await exchangeCoinPayCode({
			issuer,
			code,
			redirectUri: getRedirectUri(appOrigin),
			clientId,
			clientSecret,
			codeVerifier
		});
		const claims = await fetchCoinPayUserinfo({ issuer, accessToken: tokens.access_token });
		const coinpaySub = typeof claims.sub === 'string' || typeof claims.sub === 'number' ? String(claims.sub) : '';
		if (!coinpaySub) {
			console.error('coinpay/callback: userinfo had no sub');
			return fail('coinpay_no_subject');
		}
		const claimedEmail = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';

		const service = serviceClient();

		// --- a) Find-or-create the auth user BY SUB ---
		let authUser = await findAuthUserByCoinpaySub(service, coinpaySub);
		if (!authUser) {
			const { data: created, error: createAuthError } = await service.auth.admin.createUser({
				email: coinpayEmail(coinpaySub),
				email_confirm: true,
				user_metadata: { coinpay_sub: coinpaySub, coinpay_email: claimedEmail || null, provider: 'coinpay' }
			});
			if (createAuthError || !created?.user) {
				// Possible race: another request created it. Re-fetch once.
				authUser = await findAuthUserByCoinpaySub(service, coinpaySub);
				if (!authUser) {
					console.error('coinpay/callback: failed to create auth user', createAuthError?.message);
					return fail('coinpay_provision_failed');
				}
			} else {
				authUser = created.user;
			}
		}

		// --- b) Find-or-create the public users row ---
		const { data: existingUser, error: lookupError } = await service
			.from('users')
			.select('*')
			.eq('auth_user_id', authUser.id)
			.single();
		if (lookupError && lookupError.code !== PG_NO_ROWS) {
			console.error('coinpay/callback: users lookup error', lookupError);
		}

		let userRow = existingUser || null;
		if (!userRow) {
			const nameSeed = { name: claims.name, email: claimedEmail || coinpayEmail(coinpaySub) };
			const username = await deriveUniqueUsername(nameSeed, async (candidate) => {
				const { data } = await service.from('users').select('id').ilike('username', candidate).single();
				return !!data;
			});
			const displayName = (typeof claims.name === 'string' && claims.name.trim()) || (claimedEmail ? claimedEmail.split('@')[0] : username);

			const { data: inserted, error: insertError } = await service.from('users').insert({
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
				return fail('coinpay_provision_failed');
			}
			userRow = inserted || null;
			if (!userRow) {
				const { data: refetched } = await service.from('users').select('*').eq('auth_user_id', authUser.id).single();
				userRow = refetched || null;
			}
		}

		// --- c) A real Supabase session (magic-link bridge, no cookies) ---
		let session;
		try {
			session = await mintSession(service, authUser.id);
		} catch (err) {
			console.error('coinpay/callback: session failed', err?.message);
			return fail('coinpay_session_failed');
		}

		const message = sessionMessage(session, userRow);
		if (popup) return popupPage(appOrigin, message);
		const fragment = Buffer.from(JSON.stringify(message)).toString('base64url');
		return clearState(NextResponse.redirect(`${appOrigin}/auth#coinpay=${fragment}`));
	} catch (error) {
		console.error('coinpay/callback error:', error?.message || error);
		return fail('coinpay_login_failed');
	}
}
