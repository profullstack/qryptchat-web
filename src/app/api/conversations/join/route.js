/**
 * @fileoverview Join Conversation API Endpoint
 * Handles joining a conversation room for real-time updates
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { sseManager } from '@/lib/api/sse-manager.js';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { GroupInviteError, appUserId, parseInviteCode, redeemInvite } from '@/lib/chat/group-invites.js';

function normalizeConversationId(conversationId) {
	return typeof conversationId === 'string' ? conversationId.trim() : '';
}

/** { code }: join a group from its invite code or https://qrypt.chat/join/<code> link. */
async function joinByInvite(input, authUserId) {
	const code = parseInviteCode(input);
	if (!code) return NextResponse.json({ error: 'That is not a group invite code or link.' }, { status: 400 });
	try {
		const db = getServiceRoleClient();
		const userId = await appUserId(db, authUserId);
		const result = await redeemInvite(db, code, userId);
		sseManager.joinRoom(userId, result.conversation_id);
		return NextResponse.json({ success: true, ...result });
	} catch (error) {
		if (error instanceof GroupInviteError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
		throw error;
	}
}

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const body = await request.json();
		if (typeof body?.code === 'string') return await joinByInvite(body.code, locals.user.id);
		const conversationId = normalizeConversationId(body?.conversationId);

		if (!conversationId) {
			return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { supabase, user: authUser } = locals;

		// Get internal user ID from auth user ID
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', authUser.id)
			.single();

		if (userError || !userData) {
			console.error('User lookup failed:', userError);
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}

		const userId = userData.id;

		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', userId)
			.is('left_at', null)
			.single();

		if (participantError || !participant) {
			return NextResponse.json({ error: 'Access denied to conversation' }, { status: 403 });
		}

		// Join SSE room for real-time updates
		sseManager.joinRoom(userId, conversationId);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Join conversation error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});
