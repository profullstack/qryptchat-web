/**
 * @fileoverview Unarchive Conversation API Endpoint
 * Handles unarchiving a conversation for the current user
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.json();

		if (!conversationId) {
			return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { supabase, user: authUser } = locals;

		// Call the unarchive_conversation database function with auth user ID
		// The function will handle the conversion to internal user ID
		const { data: success, error: unarchiveError } = await supabase.rpc('unarchive_conversation', {
			conversation_uuid: conversationId,
			user_uuid: authUser.id
		});

		if (unarchiveError) {
			console.error('Unarchive conversation error:', unarchiveError);
			return NextResponse.json({ error: 'Failed to unarchive conversation' }, { status: 500 });
		}

		if (!success) {
			return NextResponse.json({
				error: 'Conversation not found or cannot be unarchived'
			}, { status: 404 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Unarchive conversation error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});