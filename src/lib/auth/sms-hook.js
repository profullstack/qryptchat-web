/**
 * GoTrue's Send SMS hook, delivered through Telnyx.
 *
 * Supabase Auth on dev2 has no working SMS provider (the Twilio account it
 * was set up with now answers 401), so GoTrue hands each code to
 * POST /api/auth/hooks/send-sms instead and we send it. The request is signed
 * with the Standard Webhooks scheme: `webhook-id`, `webhook-timestamp` and
 * `webhook-signature: v1,<base64 HMAC-SHA256 of "id.timestamp.body">`, keyed
 * by the secret GoTrue holds as `v1,whsec_<base64>`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_S = 5 * 60;

/** The raw HMAC key from `v1,whsec_<base64>` (or bare `whsec_<base64>`). */
export function hookKey(secret) {
	const s = String(secret || '').trim().replace(/^v1,/, '').replace(/^whsec_/, '');
	if (!s) throw new Error('SEND_SMS_HOOK_SECRET is not set');
	return Buffer.from(s, 'base64');
}

/** True when the Standard Webhooks signature and timestamp check out. */
export function verifyHook({ id, timestamp, signature, body }, secret, now = Date.now()) {
	if (!id || !timestamp || !signature) return false;
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_S) return false;
	const expected = createHmac('sha256', hookKey(secret)).update(`${id}.${timestamp}.${body}`).digest();
	for (const part of String(signature).split(' ')) {
		const [version, sig] = part.split(',', 2);
		if (version !== 'v1' || !sig) continue;
		const got = Buffer.from(sig, 'base64');
		if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
	}
	return false;
}

/** E.164 from GoTrue's phone (stored without the leading +). */
export function e164(phone) {
	const digits = String(phone || '').replace(/[^\d]/g, '');
	return digits.length >= 8 ? `+${digits}` : null;
}

export function smsText(otp) {
	return `Your qrypt.chat code is ${otp}. It expires in 5 minutes. Never share it.`;
}

/** Send one SMS through Telnyx. Throws with the provider's message on failure. */
export async function sendViaTelnyx({ to, text }, { apiKey = process.env.TELNYX_API_KEY, from = process.env.TELNYX_SMS_FROM, profile = process.env.TELNYX_MESSAGING_PROFILE_ID, fetchImpl = fetch } = {}) {
	if (!apiKey) throw new Error('TELNYX_API_KEY is not set');
	if (!from && !profile) throw new Error('TELNYX_SMS_FROM is not set');
	const res = await fetchImpl('https://api.telnyx.com/v2/messages', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ to, text, ...(from ? { from } : {}), ...(profile && !from ? { messaging_profile_id: profile } : {}) }),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || `HTTP ${res.status}`;
		throw new Error(`Telnyx: ${detail}`);
	}
	return data?.data?.id ?? null;
}
