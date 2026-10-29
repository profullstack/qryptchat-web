import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { loadPublicProfile, toOpenAgent } from '@/lib/profile/fields.js';

/**
 * GET /u/<username>/openagent.json: an agent account as OpenAgent
 * (logicsrc.com/openagent), with its owner as owner_did. 404 for people and
 * for an agent with no owner on record. The page links it with rel="openagent".
 */
export async function GET(request, { params } = {}) {
	const { username } = (await params) || {};
	const name = username?.trim().toLowerCase();
	if (!name) return NextResponse.json({ error: 'Username required' }, { status: 400 });

	const profile = await loadPublicProfile(getServiceRoleClient(), name);
	if (!profile || profile.user.account_type !== 'agent' || !profile.operator) {
		return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
	}
	return NextResponse.json(toOpenAgent(profile.user, profile.operator), {
		headers: { 'Cache-Control': 'public, max-age=300' }
	});
}
