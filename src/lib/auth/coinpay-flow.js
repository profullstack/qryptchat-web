/**
 * @fileoverview The pending half of "Sign in with CoinPay": what the start
 * routes keep in a short-lived httpOnly cookie for the callback (state, PKCE
 * verifier, nonce, popup flag, and for "connect" the signed-in user it was
 * started by). HMAC-sealed under the OAuth client secret so the browser can hold
 * it but not forge or edit it: a connect cookie names the account CoinPay gets
 * linked to, so an unsigned one would let anyone link their CoinPay to someone
 * else's account.
 *
 * Plus the connect/disconnect decisions, kept free of Supabase for tests.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** One cookie for both modes, scoped to the CoinPay auth routes. */
export const COINPAY_PENDING_COOKIE = 'qrypt_coinpay_pending';
export const COINPAY_PENDING_PATH = '/api/auth/coinpay';
export const COINPAY_PENDING_TTL = 600;

const mac = (body, key) => createHmac('sha256', `qrypt-coinpay-pending:${key}`).update(body).digest('base64url');

/**
 * @param {{ state: string, verifier: string, nonce: string, mode: 'login'|'connect', popup?: boolean, userId?: string|null }} p
 * @param {string} key the OAuth client secret
 * @param {number} [now] seconds
 */
export function sealPending(p, key, now = Math.floor(Date.now() / 1000)) {
	const body = Buffer.from(JSON.stringify({ ...p, exp: now + COINPAY_PENDING_TTL })).toString('base64url');
	return `${body}.${mac(body, key)}`;
}

/** The pending sign-in, or null when missing, forged, edited or expired. */
export function unsealPending(raw, key, now = Math.floor(Date.now() / 1000)) {
	if (!raw || typeof raw !== 'string' || !key) return null;
	const dot = raw.lastIndexOf('.');
	if (dot < 1) return null;
	const body = raw.slice(0, dot);
	const got = Buffer.from(raw.slice(dot + 1));
	const want = Buffer.from(mac(body, key));
	if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
	try {
		const o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
		if (typeof o.state !== 'string' || typeof o.verifier !== 'string' || typeof o.nonce !== 'string') return null;
		if (o.mode !== 'login' && o.mode !== 'connect') return null;
		if (o.mode === 'connect' && (typeof o.userId !== 'string' || !o.userId)) return null;
		if (typeof o.exp !== 'number' || o.exp < now) return null;
		return { state: o.state, verifier: o.verifier, nonce: o.nonce, mode: o.mode, popup: !!o.popup, userId: o.userId ?? null };
	} catch {
		return null;
	}
}

/**
 * Connect CoinPay `sub` to the signed-in account `userId`.
 * @param {{ userId: string, sub: string, boundTo: { id: string }|null, currentSub: string|null }} input
 *   boundTo: the account already carrying this sub (if any); currentSub: the sub this account already has.
 * @returns {{ ok: true, already?: boolean } | { ok: false, code: string }}
 */
export function decideConnect({ userId, sub, boundTo, currentSub }) {
	if (!userId) return { ok: false, code: 'coinpay_not_signed_in' };
	if (boundTo && boundTo.id !== userId) return { ok: false, code: 'coinpay_linked_elsewhere' };
	if (currentSub && currentSub !== sub) return { ok: false, code: 'coinpay_already_connected' };
	return currentSub === sub ? { ok: true, already: true } : { ok: true };
}

/**
 * Disconnect is refused when CoinPay is the only way into the account: an
 * account CoinPay created has a placeholder address and no phone, so without a
 * passkey it could never sign in again.
 * @param {{ email?: string|null, phone?: string|null }} user
 * @param {number} passkeys
 * @param {(email: string|null|undefined) => boolean} isCoinpayEmail
 */
export function canDisconnect(user, passkeys, isCoinpayEmail) {
	const hasPhone = typeof user?.phone === 'string' && user.phone.length > 0;
	const hasRealEmail = !!user?.email && !isCoinpayEmail(user.email);
	return hasPhone || hasRealEmail || passkeys > 0;
}
