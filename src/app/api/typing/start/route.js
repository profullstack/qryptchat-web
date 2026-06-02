/**
 * @fileoverview Start Typing API Endpoint
 * Broadcasts typing indicator to conversation participants
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { sseManager } from '@/lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '@/lib/api/protocol.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.NextResponse.json();

		if (!conversationId) {
			return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { supabase, user: authUser } = locals;

		// Get internal user ID from auth user ID
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('id, username, display_name')
			.eq('auth_user_id', authUser.id)
			.single();

		if (userError || !userData) {
			console.error('User lookup failed:', userError);
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}

		const userId = userData.id;

		// Broadcast typing indicator to conversation
		sseManager.broadcastToRoom(conversationId, MESSAGE_TYPES.USER_TYPING, {
			userId,
			username: userData.username,
			displayName: userData.display_name,
			conversationId,
			isTyping: true
		}, userId);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Start typing error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});