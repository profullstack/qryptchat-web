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
 *   redirect a 2-minute cookie on /auth that the page reads once and deletes.
 *            Not a URL: a link carrying a session would let anyone sign a
 *            victim into the attacker's account, and only our own callback can
 *            set a cookie on this origin.
 * Errors go the same two ways, so the user always sees why.
 *
 * Open to ANYONE. Additive only — does NOT touch the phone/SMS or anon flows.
 */

import { NextResponse } from 'next/server';
import { finishSignIn, sameState } from '@profullstack/coinpay-onboard/oauth';
import {
	getCoinpayConfig,
	getAppOrigin,
	getRedirectUri,
	deriveUniqueUsername
} from '@/lib/auth/coinpay.js';
import { mintSession, serviceClient } from '@/lib/auth/cli-auth.js';
import { COINPAY_HANDOFF_COOKIE, coinpayEmail, findAuthUserByCoinpaySub, sessionMessage } from '@/lib/auth/coinpay-identity.js';
import { COINPAY_PENDING_COOKIE, COINPAY_PENDING_PATH, decideConnect, unsealPending } from '@/lib/auth/coinpay-flow.js';

/** Postgres unique-violation error code. */
const PG_UNIQUE_VIOLATION = '23505';
/** "no rows returned" from PostgREST .single(). */
const PG_NO_ROWS = 'PGRST116';

const clearState = (res) => {
	res.cookies.set(COINPAY_PENDING_COOKIE, '', {
		httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: COINPAY_PENDING_PATH, maxAge: 0
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

	const { issuer, clientId, clientSecret } = getCoinpayConfig();
	// The sealed pending sign-in from the login/connect route (state, PKCE
	// verifier, nonce, popup flag, and for connect the signed-in account).
	const pending = unsealPending(request.cookies.get(COINPAY_PENDING_COOKIE)?.value, clientSecret);
	const popup = !!pending?.popup;
	const fail = (code) =>
		popup
			? popupPage(appOrigin, { type: 'coinpay-error', code })
			: clearState(
					NextResponse.redirect(
						pending?.mode === 'connect'
							? `${appOrigin}/settings?coinpay=${encodeURIComponent(code)}`
							: `${appOrigin}/auth?error=${encodeURIComponent(code)}`
					)
				);

	try {
		if (!clientId || !clientSecret) {
			console.error('coinpay/callback: client credentials not configured');
			return fail('coinpay_unavailable');
		}
		if (!pending || !sameState(pending.state, url.searchParams.get('state'))) return fail('coinpay_state_mismatch');

		// No code means CoinPay sent the user back without one: cancelled
		// (?error=…) or broken. The provider's error text is not logged.
		const code = url.searchParams.get('code');
		if (!code) return fail(url.searchParams.has('error') ? 'coinpay_denied' : 'coinpay_missing_code');

		// --- Code exchange (PKCE + client secret), id_token checks (iss, aud,
		// exp, nonce), then userinfo, whose sub must match the id_token's ---
		let claims;
		try {
			const r = await finishSignIn({
				code,
				verifier: pending.verifier,
				nonce: pending.nonce,
				clientId,
				clientSecret,
				redirectUri: getRedirectUri(appOrigin),
				base: issuer
			});
			claims = { ...r.userinfo, sub: r.sub, email: r.email ?? undefined, name: r.name ?? undefined };
		} catch (err) {
			console.error('coinpay/callback: sign-in not verified:', err?.message || err);
			return fail('coinpay_id_token');
		}
		const coinpaySub = typeof claims.sub === 'string' || typeof claims.sub === 'number' ? String(claims.sub) : '';
		if (!coinpaySub) {
			console.error('coinpay/callback: userinfo had no sub');
			return fail('coinpay_no_subject');
		}
		const claimedEmail = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';

		const service = serviceClient();

		// --- Connect: link this CoinPay sub to the account that started it ---
		if (pending.mode === 'connect') {
			const { data: me, error: meError } = await service.auth.admin.getUserById(pending.userId);
			if (meError || !me?.user) return fail('coinpay_not_signed_in');
			const boundTo = await findAuthUserByCoinpaySub(service, coinpaySub);
			const decision = decideConnect({
				userId: me.user.id,
				sub: coinpaySub,
				boundTo,
				currentSub: me.user.app_metadata?.coinpay_sub || null
			});
			if (!decision.ok) return fail(decision.code);
			if (!decision.already) {
				const { error: linkError } = await service.auth.admin.updateUserById(me.user.id, {
					// app_metadata: only the service role can write it. The email is
					// unverified contact info, never an identity.
					app_metadata: { coinpay_sub: coinpaySub, coinpay_email: claimedEmail || null }
				});
				if (linkError) {
					console.error('coinpay/callback: link failed', linkError.message);
					return fail('coinpay_provision_failed');
				}
			}
			if (popup) return popupPage(appOrigin, { type: 'coinpay-connected' });
			return clearState(NextResponse.redirect(`${appOrigin}/settings?coinpay=connected`));
		}


		// --- a) Find-or-create the auth user BY SUB ---
		let authUser = await findAuthUserByCoinpaySub(service, coinpaySub);
		if (!authUser) {
			const { data: created, error: createAuthError } = await service.auth.admin.createUser({
				email: coinpayEmail(coinpaySub),
				email_confirm: true,
				// The binding is server-only (app_metadata); user_metadata is user-writable.
				app_metadata: { coinpay_sub: coinpaySub },
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
		const res = clearState(NextResponse.redirect(`${appOrigin}/auth`));
		res.cookies.set(COINPAY_HANDOFF_COOKIE, Buffer.from(JSON.stringify(message)).toString('base64url'), {
			httpOnly: false, // the page reads it once, then deletes it
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/auth',
			maxAge: 120
		});
		return res;
	} catch (error) {
		console.error('coinpay/callback error:', error?.message || error);
		return fail('coinpay_login_failed');
	}
}
