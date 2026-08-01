/**
 * @fileoverview Join Conversation API Endpoint
 * Handles joining a conversation room for real-time updates
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { sseManager } from '@/lib/api/sse-manager.js';

function normalizeConversationId(conversationId) {
	return typeof conversationId === 'string' ? conversationId.trim() : '';
}

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId: rawConversationId } = await request.json();
		const conversationId = normalizeConversationId(rawConversationId);

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
