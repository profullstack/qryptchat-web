/**
 * The three CoinPay calls qrypt.chat needs: start a hosted checkout, check a
 * webhook's signature, read a webhook. Same behaviour as @profullstack/coinpay-onboard
 * (CoinPay class, verifyWebhook, readWebhook), kept here so the web app does not
 * pull in that package's CLI/MCP dependencies (zod 3, the MCP SDK, express).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_BASE = 'https://coinpayportal.com';
const PAID_EVENTS = new Set(['payment.confirmed', 'payment.forwarded']);
const PAID_STATUSES = new Set(['confirmed', 'forwarded', 'completed', 'paid']);

export class CoinPayError extends Error {
	constructor(message, status, body) {
		super(message);
		this.name = 'CoinPayError';
		this.status = status;
		this.body = body;
	}
}

/** A hosted checkout (any coin or PayPal); returns { id, url, status, ... }. */
export async function createCheckoutSession({ base = DEFAULT_BASE, token, fetchImpl = fetch }, input) {
	if (!input.customerEmail?.trim()) throw new CoinPayError('customerEmail is required for a checkout session', 400);
	if (!input.accountId?.trim()) throw new CoinPayError('accountId is required for a checkout session', 400);
	const url = `${String(base || DEFAULT_BASE).replace(/\/+$/, '').replace(/\/api$/, '')}/api/checkout/sessions`;
	const res = await fetchImpl(url, {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}` },
		body: JSON.stringify({
			amount: input.amount,
			currency: input.currency ?? 'USD',
			description: input.description,
			customer_email: input.customerEmail.trim(),
			account_id: input.accountId.trim(),
			...(input.property ? { property: input.property } : {}),
			...(input.metadata ? { metadata: input.metadata } : {}),
			...(input.successUrl ? { success_url: input.successUrl } : {}),
			...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
			expires_in_minutes: input.expiresInMinutes ?? 60,
		}),
		signal: AbortSignal.timeout(30_000),
	});
	const text = await res.text();
	let body = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		throw new CoinPayError(`CoinPay answered ${res.status} with something that is not JSON`, res.status, text.slice(0, 200));
	}
	if (!res.ok || body?.success === false) throw new CoinPayError(body?.error ?? body?.message ?? `CoinPay answered ${res.status}`, res.status, body);
	const s = body?.session ?? body ?? {};
	return { id: String(s.id), url: String(s.url ?? ''), status: String(s.status ?? 'open'), expiresAt: s.expires_at ?? null };
}

/** `x-coinpay-signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">`, within 5 minutes. */
export function verifyWebhook(rawBody, header, secret, now = Date.now(), toleranceSeconds = 300) {
	if (!header || !secret) return false;
	const parts = Object.fromEntries(String(header).split(',').map((kv) => kv.trim().split('=')));
	const t = Number(parts.t);
	const v1 = parts.v1;
	if (!Number.isFinite(t) || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
	if (Math.abs(now / 1000 - t) > toleranceSeconds) return false;
	const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'), 'hex');
	const given = Buffer.from(v1, 'hex');
	return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Signs a body the way CoinPay does (tests). */
export function signWebhook(rawBody, secret, now = Date.now()) {
	const t = Math.floor(now / 1000);
	return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`;
}

/** The parts of a webhook we use: the payload is nested in `data`; the top-level id is the event. */
export function readWebhook(payload) {
	const p = payload ?? {};
	const d = p.data && typeof p.data === 'object' ? p.data : p;
	const metadata = d.metadata && typeof d.metadata === 'object' ? d.metadata : p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
	const type = String(p.type ?? p.event ?? '');
	const status = String(d.status ?? '').toLowerCase();
	const paid = type ? PAID_EVENTS.has(type) && (status === '' || PAID_STATUSES.has(status)) : PAID_STATUSES.has(status);
	const str = (...v) => v.find((x) => typeof x === 'string' && x.trim())?.trim() ?? null;
	return {
		eventId: String(p.id ?? ''),
		type,
		paid,
		checkoutSessionId: str(d.checkout_session_id, metadata.checkout_session_id),
		accountId: str(d.account_id, metadata.account_id),
		metadata,
	};
}
