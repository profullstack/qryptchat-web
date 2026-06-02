/**
 * @fileoverview Archive Conversation API Endpoint
 * Handles archiving a conversation for the current user
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.NextResponse.json();

		if (!conversationId) {
			return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { supabase, user: authUser } = locals;

		// Call the archive_conversation database function with auth user ID
		// The function will handle the conversion to internal user ID
		const { data: success, error: archiveError } = await supabase.rpc('archive_conversation', {
			conversation_uuid: conversationId,
			user_uuid: authUser.id
		});

		if (archiveError) {
			console.error('Archive conversation error:', archiveError);
			return NextResponse.json({ error: 'Failed to archive conversation' }, { status: 500 });
		}

		if (!success) {
			return NextResponse.json({
				error: 'Conversation not found or cannot be archived'
			}, { status: 404 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Archive conversation error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});