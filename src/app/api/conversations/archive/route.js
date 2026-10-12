/**
 * @fileoverview Archive Conversation API Endpoint
 * Handles archiving a conversation for the current user
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { sseManager } from '@/lib/api/sse-manager.js';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { appUserId } from '@/lib/chat/group-invites.js';
import { announceArchived } from '@/lib/chat/membership-events.js';

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

		// Every device of this user moves the chat between its lists.
		// Announcing never turns a done archive into an error.
		try {
			announceArchived(sseManager, await appUserId(getServiceRoleClient(), authUser.id), conversationId, true);
		} catch {}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Archive conversation error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});
