/**
 * @fileoverview Join Conversation API Endpoint
 * Handles joining a conversation room for real-time updates
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { sseManager } from '@/lib/api/sse-manager.js';

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
			.select('id')
			.eq('auth_user_id', authUser.id)
			.single();

		if (userError || !userData) {
			console.error('User lookup failed:', userError);
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}

		const userId = userData.id;

		// Join SSE room for real-time updates
		sseManager.joinRoom(userId, conversationId);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Join conversation error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});