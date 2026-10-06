import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';

/**
 * POST /api/calls/token { conversationId }: a PairUX token for an end-to-end
 * encrypted call in this conversation.
 *
 * qrypt.chat is a PairUX partner: this server holds PAIRUX_PARTNER_KEY and
 * mints tokens for its own users, so nobody needs a PairUX account. The token
 * only lets a participant into the conversation's room; the media key that
 * actually encrypts the call travels in an ML-KEM-encrypted 'call' message and
 * never reaches this server or PairUX.
 */
const PAIRUX_URL = (process.env.PAIRUX_URL || 'https://pairux.com').replace(/\/+$/, '');
const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const POST = withAuth(async ({ request, locals }) => {
	const key = process.env.PAIRUX_PARTNER_KEY;
	if (!key) return NextResponse.json({ error: 'Calls are not configured' }, { status: 503 });

	const body = await request.json().catch(() => ({}));
	const conversationId = typeof body?.conversationId === 'string' ? body.conversationId.trim() : '';
	if (!ROOM_RE.test(conversationId)) return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });

	const { supabase, user: authUser } = locals;
	const { data: me } = await supabase.from('users').select('id, username, display_name').eq('auth_user_id', authUser.id).single();
	if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 });

	const { data: participant } = await supabase
		.from('conversation_participants')
		.select('id')
		.eq('conversation_id', conversationId)
		.eq('user_id', me.id)
		.is('left_at', null)
		.maybeSingle();
	if (!participant) return NextResponse.json({ error: 'Not a participant in this conversation' }, { status: 403 });

	let res;
	try {
		res = await fetch(`${PAIRUX_URL}/api/v1/partner/token`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ room: conversationId, identity: me.id, name: (me.display_name || me.username || 'qrypt user').slice(0, 50) }),
		});
	} catch {
		return NextResponse.json({ error: 'Could not reach the call service' }, { status: 502 });
	}
	const data = await res.json().catch(() => ({}));
	const payload = data?.data ?? data;
	if (!res.ok || !payload?.token) {
		console.error('[calls/token] pairux refused', res.status, payload?.error || payload?.message);
		return NextResponse.json({ error: 'The call service refused the request' }, { status: 502 });
	}
	return NextResponse.json(
		{ token: payload.token, url: payload.url, iceServers: payload.iceServers ?? [], roomName: payload.roomName },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
});
