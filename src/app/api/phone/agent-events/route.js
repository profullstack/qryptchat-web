import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';

export const dynamic = 'force-dynamic';

const WAIT_MS = 20_000;
const STEP_MS = 250;

function authorized(request) {
	const secret = process.env.AGENT_PHONE_SECRET;
	const given = request.headers.get('x-agent-phone-secret') || '';
	if (!secret || given.length !== secret.length) return false;
	return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/**
 * GET /api/phone/agent-events?session=<call_session_id>&after=<id>: the Telnyx
 * events for one agent call, waiting up to 20 s for new ones (long poll).
 * Only the agent host holds AGENT_PHONE_SECRET.
 */
export async function GET(request) {
	if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const url = new URL(request.url);
	const session = url.searchParams.get('session') || '';
	const after = Number(url.searchParams.get('after') || 0);
	if (!session) return NextResponse.json({ error: 'session is required' }, { status: 400 });
	const db = getServiceRoleClient();
	const deadline = Date.now() + WAIT_MS;
	while (true) {
		const { data, error } = await db
			.from('phone_agent_events')
			.select('id, event')
			.eq('session_id', session)
			.gt('id', after)
			.order('id', { ascending: true })
			.limit(100);
		if (error) return NextResponse.json({ error: error.message }, { status: 500 });
		if (data?.length || Date.now() >= deadline || request.signal?.aborted) {
			return NextResponse.json({ events: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
		}
		await new Promise((r) => setTimeout(r, STEP_MS));
	}
}
