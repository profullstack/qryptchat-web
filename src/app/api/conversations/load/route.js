/**
 * @fileoverview Load Conversations API Endpoint
 * Handles loading user's conversations
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';

export const POST = withAuth(async ({ locals }) => {
	try {
		const { supabase, user } = locals;

		// Load user's conversations with participants and last message
		const { data: participations, error: partError } = await supabase
			.from('conversation_participants')
			.select('conversation_id')
			.eq('user_id', user.id);

		if (partError) {
			console.error('Failed to load participations:', partError);
			return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
		}

		const conversationIds = participations.map(p => p.conversation_id);

		if (conversationIds.length === 0) {
			return NextResponse.json({ success: true, conversations: [] });
		}

		const { data: conversations, error } = await supabase
			.from('conversations')
			.select(`
				*,
				participants:conversation_participants(
					user_id,
					user:profiles(*)
				)
			`)
			.in('id', conversationIds)
			.order('updated_at', { ascending: false });

		if (error) {
			console.error('Failed to load conversations:', error);
			return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			conversations
		});
	} catch (error) {
		console.error('Load conversations error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});