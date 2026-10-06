import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { AgentError, redeemInvite, tokenFrom } from '@/lib/agents/agents.js';
import { mintSession } from '@/lib/auth/cli-auth.js';

/**
 * POST /api/agents/redeem  { token, username, displayName?, publicKey }
 * An agent joins qrypt.chat with an invite. `publicKey` is its own
 * ML-KEM-1024 public key; the private key never leaves the agent. Returns a
 * session (access + refresh token) for qc, the account, and the conversation
 * with the person who invited it.
 *
 * No session needed: the 256-bit invite token is the credential.
 */
export async function POST(request) {
	try {
		const body = await request.json().catch(() => null);
		const token = tokenFrom(body?.token);
		if (!token) return NextResponse.json({ error: 'A valid invite token is required', code: 'invalid_token' }, { status: 400 });

		const db = getServiceRoleClient();
		const { authUserId, user, conversationId, operator } = await redeemInvite(db, token, {
			username: body?.username,
			displayName: body?.displayName,
			publicKey: body?.publicKey,
		});
		const session = await mintSession(db, authUserId);
		return NextResponse.json(
			{ ...session, user, conversation_id: conversationId, operator },
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (error) {
		if (error instanceof AgentError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
		console.error('[agents/redeem]', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
