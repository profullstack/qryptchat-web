/**
 * Prepaid phone credit, paid on CoinPay's hosted checkout (any coin or PayPal).
 *
 * POST /api/phone/topup makes a phone_topups row and a checkout session whose
 * metadata names it; CoinPay's signed webhook (/api/phone/coinpay-webhook) marks
 * it paid and adds the credit exactly once (phone_credit_topup).
 * Env (from `coinpay-onboard site qryptchat-web`): COINPAY_API_URL, COINPAY_API_KEY,
 * COINPAY_WEBHOOK_SECRET.
 */
import { createCheckoutSession, readWebhook, verifyWebhook } from './coinpay.js';
import { TOPUP_DOLLARS } from '@/lib/phone/rules.js';
import { PhoneError } from './phone.js';

export const coinpayConfigured = (env = process.env) => !!(env.COINPAY_API_KEY && env.COINPAY_WEBHOOK_SECRET);

/** A CoinPay client for the business key (only what the top-up needs). */
export const coinpayClient = (env = process.env) => ({
	createCheckoutSession: (input) => createCheckoutSession({ base: env.COINPAY_API_URL || undefined, token: env.COINPAY_API_KEY }, input),
});

const SITE = 'https://qrypt.chat';

/** Start a top-up; returns the CoinPay checkout URL to send the person to. */
export async function createTopup({ store, coinpay, user, email, dollars }) {
	const amount = Number(dollars);
	if (!TOPUP_DOLLARS.includes(amount)) throw new PhoneError(`Credit comes in $${TOPUP_DOLLARS.join(', $')}.`, 400);
	const topup = await store.insertTopup({ user_id: user.id, amount_cents: amount * 100 });
	const session = await coinpay.createCheckoutSession({
		amount,
		description: `qrypt.chat phone credit, $${amount}`,
		// CoinPay needs an email; people who signed in by phone or passkey may not have one.
		customerEmail: email || `${user.id}@phone.qrypt.chat`,
		accountId: user.id,
		property: 'qrypt.chat',
		metadata: { kind: 'phone_credit', topup: topup.id },
		successUrl: `${SITE}/phone?paid={CHECKOUT_SESSION_ID}`,
		cancelUrl: `${SITE}/phone`,
	});
	await store.setTopupSession(topup.id, session.id);
	return { url: session.url, topupId: topup.id };
}

/** One CoinPay webhook (raw body). Returns { credited } or why it was ignored. */
export async function handleCoinpayWebhook({ store, rawBody, signature, secret }) {
	if (!verifyWebhook(rawBody, signature, secret)) throw new PhoneError('Bad signature', 401);
	const event = readWebhook(JSON.parse(rawBody));
	// The checkout's metadata names the top-up; if CoinPay left it off the payment, find it by session.
	const topupId = event?.metadata?.topup || (event?.checkoutSessionId ? await store.topupIdBySession(event.checkoutSessionId) : null);
	if (!topupId || (event?.metadata?.kind && event.metadata.kind !== 'phone_credit')) return { ignored: 'not phone credit' };
	if (!event.paid) return { ignored: 'not paid yet' };
	const balance = await store.creditTopup(topupId);
	return balance === null ? { ignored: 'already credited' } : { credited: true, balance };
}
