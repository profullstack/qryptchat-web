/**
 * @fileoverview Delete Conversation API Endpoint
 * Handles removing a user's participation and their data from a conversation.
 *
 * A participant may only destroy rows they own — their own messages, their own file
 * attachments and their own participation — whatever the conversation type. The shared
 * conversation row and anything still belonging to other people is removed only once the
 * last active participant has left, at which point there is nobody left to lose data.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.json();

		if (!conversationId) {
			return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { supabase, user: authUser } = locals;

		console.log(`🗑️ Delete request for conversation ${conversationId} by auth user ${authUser.id}`);

		// Get the internal user ID from the users table
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', authUser.id)
			.single();

		if (userError || !internalUser) {
			console.error('❌ Failed to find internal user:', userError);
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}

		const internalUserId = internalUser.id;
		console.log(`🗑️ Using internal user ID: ${internalUserId}`);

		// First, verify the user is a participant and get conversation details
		// Note: We need to check for left_at IS NULL to exclude participants who have left
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id, left_at, archived_at')
			.eq('conversation_id', conversationId)
			.eq('user_id', internalUserId)
			.is('left_at', null)
			.maybeSingle();

		// Log detailed error information
		if (participantError) {
			console.error('❌ Participant query error:', {
				error: participantError,
				code: participantError.code,
				message: participantError.message,
				details: participantError.details,
				hint: participantError.hint
			});
			return NextResponse.json({
				error: 'Database error checking participation'
			}, { status: 500 });
		}

		if (!participant) {
			console.error('❌ User not a participant:', {
				conversationId,
				userId: authUser.id
			});
			return NextResponse.json({
				error: 'Conversation not found or you are not a participant'
			}, { status: 404 });
		}

		console.log(`✅ User is a participant, proceeding with deletion`);

		// Get conversation type and participant count
		const { data: conversation, error: convError } = await supabase
			.from('conversations')
			.select('type')
			.eq('id', conversationId)
			.single();

		if (convError) {
			console.error('Error fetching conversation:', convError);
			return NextResponse.json({ error: 'Failed to fetch conversation details' }, { status: 500 });
		}

		// Every participant — direct or group — may only remove what belongs to them.
		// Dependent rows (deliveries, message_recipients, message_status, encrypted_files)
		// are ON DELETE CASCADE from messages, so deleting the sender's own messages is enough.
		const { error: ownMessagesError } = await supabase
			.from('messages')
			.delete()
			.eq('conversation_id', conversationId)
			.eq('sender_id', internalUserId);

		if (ownMessagesError) {
			console.error('Error deleting user messages:', ownMessagesError);
			return NextResponse.json({ error: 'Failed to delete your messages' }, { status: 500 });
		}

		const { error: ownFilesError } = await supabase
			.from('file_attachments')
			.delete()
			.eq('conversation_id', conversationId)
			.eq('uploaded_by', internalUserId);

		if (ownFilesError) {
			console.error('Error deleting user file attachments:', ownFilesError);
		}

		const { error: leaveError } = await supabase
			.from('conversation_participants')
			.delete()
			.eq('conversation_id', conversationId)
			.eq('user_id', internalUserId);

		if (leaveError) {
			console.error('Error removing user participation:', leaveError);
			return NextResponse.json({ error: 'Failed to leave conversation' }, { status: 500 });
		}

		// Garbage-collect the shared conversation only once nobody is left in it.
		const serviceClient = getServiceRoleClient();
		const { data: remaining, error: remainingError } = await serviceClient
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.is('left_at', null)
			.limit(1);

		if (remainingError) {
			console.error('Error counting remaining participants:', remainingError);
			return NextResponse.json({ error: 'Failed to finalise deletion' }, { status: 500 });
		}

		const isOrphaned = (remaining?.length ?? 0) === 0;
		console.log(
			`🗑️ ${conversation.type} conversation ${conversationId}: caller removed, orphaned=${isOrphaned}`
		);

		if (isOrphaned) {
			// Nobody is left in this conversation, so the leftovers belong to no one. Rows that
			// hang off messages cascade; the rest are cleaned up explicitly.
			const { error: smsConvError } = await serviceClient
				.from('sms_notifications')
				.delete()
				.eq('conversation_id', conversationId);

			if (smsConvError) {
				console.error('Error deleting SMS notifications by conversation:', smsConvError);
			}

			const { error: messagesError } = await serviceClient
				.from('messages')
				.delete()
				.eq('conversation_id', conversationId);

			if (messagesError) {
				console.error('Error deleting messages:', messagesError);
				return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 });
			}

			const { error: typingError } = await serviceClient
				.from('typing_indicators')
				.delete()
				.eq('conversation_id', conversationId);

			if (typingError) {
				console.error('Error deleting typing indicators:', typingError);
			}

			const { error: participantsError } = await serviceClient
				.from('conversation_participants')
				.delete()
				.eq('conversation_id', conversationId);

			if (participantsError) {
				console.error('Error deleting participants:', participantsError);
				return NextResponse.json({ error: 'Failed to delete participants' }, { status: 500 });
			}

			const { error: conversationError } = await serviceClient
				.from('conversations')
				.delete()
				.eq('id', conversationId);

			if (conversationError) {
				console.error('Error deleting conversation:', conversationError);
				return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
			}

			console.log(`✅ Garbage-collected orphaned conversation ${conversationId}`);
		}

		return NextResponse.json({ success: true, conversationRemoved: isOrphaned });
	} catch (error) {
		console.error('Delete conversation error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});
