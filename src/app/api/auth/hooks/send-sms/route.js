import { NextResponse } from 'next/server';
import { e164, sendCode, verifyHook } from '@/lib/auth/sms-hook.js';

/**
 * POST /api/auth/hooks/send-sms: Supabase Auth's Send SMS hook.
 * GoTrue calls this with { user, sms: { otp } } for every phone code it issues;
 * we deliver it through Telnyx Verify (see sms-hook.js for why not a plain SMS). Errors use the hook error shape so GoTrue
 * passes a useful message back to the sign-in form.
 */
const fail = (status, message) => NextResponse.json({ error: { http_code: status, message } }, { status });

export async function POST(request) {
	const body = await request.text();
	const secret = process.env.SEND_SMS_HOOK_SECRET;
	if (!secret) return fail(500, 'SMS hook is not configured');

	const ok = verifyHook(
		{
			id: request.headers.get('webhook-id'),
			timestamp: request.headers.get('webhook-timestamp'),
			signature: request.headers.get('webhook-signature'),
			body,
		},
		secret,
	);
	if (!ok) return fail(401, 'Invalid signature');

	let payload;
	try {
		payload = JSON.parse(body);
	} catch {
		return fail(400, 'Invalid JSON');
	}
	const to = e164(payload?.user?.phone);
	const otp = payload?.sms?.otp;
	if (!to || !otp) return fail(400, 'Missing phone or code');

	try {
		await sendCode({ to, otp });
		return NextResponse.json({});
	} catch (err) {
		console.error('[send-sms hook]', err?.message);
		return fail(502, 'Could not send the code. Please try again.');
	}
}
