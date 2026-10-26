import { NextResponse } from 'next/server';
import { handleEvent } from '@/lib/server/phone.js';
import { phoneContext } from '@/lib/server/phone-route.js';
import { telnyxConfig, verifyWebhook } from '@/lib/server/telnyx-voice.js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/phone/webhook: Telnyx Call Control events for qrypt.chat calls
 * (answered, hangup, ...). Signed with Ed25519; anything unsigned is refused.
 */
export async function POST(request) {
	const body = await request.text();
	const ok = verifyWebhook({
		body,
		signature: request.headers.get('telnyx-signature-ed25519'),
		timestamp: request.headers.get('telnyx-timestamp'),
		publicKey: telnyxConfig().publicKey,
	});
	if (!ok) return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
	let event;
	try {
		event = JSON.parse(body)?.data;
	} catch {
		return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
	}
	try {
		const result = await handleEvent({ ...phoneContext(), event });
		return NextResponse.json({ ok: true, ...result });
	} catch (error) {
		console.error('[phone/webhook]', event?.event_type, error?.message);
		// 500 makes Telnyx retry, which handleEvent tolerates.
		return NextResponse.json({ error: 'failed' }, { status: 500 });
	}
}
