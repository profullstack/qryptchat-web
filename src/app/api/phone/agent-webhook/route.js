import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { telnyxConfig, verifyWebhook } from '@/lib/server/telnyx-voice.js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/phone/agent-webhook: Telnyx events for phone calls AI agents place
 * (the "qrypt.chat agent calls" Call Control app). Stored for the agent to pick
 * up from /api/phone/agent-events; old rows are pruned as new ones arrive.
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
	const sessionId = event?.payload?.call_session_id;
	if (!sessionId) return NextResponse.json({ ok: true, ignored: 'no session' });
	const db = getServiceRoleClient();
	const { error } = await db.from('phone_agent_events').insert({ session_id: sessionId, event });
	if (error) {
		console.error('[phone/agent-webhook]', error.message);
		return NextResponse.json({ error: 'failed' }, { status: 500 });
	}
	if (Math.random() < 0.02) {
		await db.from('phone_agent_events').delete().lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
	}
	return NextResponse.json({ ok: true });
}
