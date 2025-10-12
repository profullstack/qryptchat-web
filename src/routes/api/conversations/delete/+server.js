/**
 * @fileoverview Delete Conversation API Endpoint
 * Handles removing a user's participation and their data from a conversation
 * For direct messages: deletes the entire conversation if user is a participant
 * For groups: only removes the user's participation and their messages/files
 */

import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.json();

		if (!conversationId) {
			return json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { supabase, user: authUser } = locals;

		// First, verify the user is a participant and get conversation details
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', authUser.id)
			.single();

		if (participantError || !participant) {
			console.error('User not a participant:', participantError);
			return json({
				error: 'Conversation not found or you are not a participant'
			}, { status: 404 });
		}

		// Get conversation type and participant count
		const { data: conversation, error: convError } = await supabase
			.from('conversations')
			.select('type')
			.eq('id', conversationId)
			.single();

		if (convError) {
			console.error('Error fetching conversation:', convError);
			return json({ error: 'Failed to fetch conversation details' }, { status: 500 });
		}

		const { count: participantCount, error: countError } = await supabase
			.from('conversation_participants')
			.select('*', { count: 'exact', head: true })
			.eq('conversation_id', conversationId);

		if (countError) {
			console.error('Error counting participants:', countError);
		}

		// Determine if this is a direct message (2 participants) or group
		const isDirectMessage = conversation.type === 'direct' || participantCount === 2;

		if (isDirectMessage) {
			// For direct messages, delete everything for all participants
			console.log(`Deleting direct message conversation ${conversationId} for all participants`);

			// Delete all messages
			const { error: messagesError } = await supabase
				.from('messages')
				.delete()
				.eq('conversation_id', conversationId);

			if (messagesError) {
				console.error('Error deleting messages:', messagesError);
				return json({ error: 'Failed to delete messages' }, { status: 500 });
			}

			// Delete all file attachments
			const { error: filesError } = await supabase
				.from('file_attachments')
				.delete()
				.eq('conversation_id', conversationId);

			if (filesError) {
				console.error('Error deleting file attachments:', filesError);
			}

			// Delete all participants
			const { error: participantsError } = await supabase
				.from('conversation_participants')
				.delete()
				.eq('conversation_id', conversationId);

			if (participantsError) {
				console.error('Error deleting participants:', participantsError);
				return json({ error: 'Failed to delete participants' }, { status: 500 });
			}

			// Delete the conversation
			const { error: conversationError } = await supabase
				.from('conversations')
				.delete()
				.eq('id', conversationId);

			if (conversationError) {
				console.error('Error deleting conversation:', conversationError);
				return json({ error: 'Failed to delete conversation' }, { status: 500 });
			}

			console.log(`✅ Successfully deleted direct message conversation ${conversationId}`);
		} else {
			// For group conversations, only delete user's own data
			console.log(`Removing user ${authUser.id} from group conversation ${conversationId}`);

			// Delete only the user's messages
			const { error: messagesError } = await supabase
				.from('messages')
				.delete()
				.eq('conversation_id', conversationId)
				.eq('sender_id', authUser.id);

			if (messagesError) {
				console.error('Error deleting user messages:', messagesError);
				return json({ error: 'Failed to delete your messages' }, { status: 500 });
			}

			// Delete only the user's file attachments
			const { error: filesError } = await supabase
				.from('file_attachments')
				.delete()
				.eq('conversation_id', conversationId)
				.eq('uploaded_by', authUser.id);

			if (filesError) {
				console.error('Error deleting user file attachments:', filesError);
			}

			// Remove user's participation
			const { error: participantError } = await supabase
				.from('conversation_participants')
				.delete()
				.eq('conversation_id', conversationId)
				.eq('user_id', authUser.id);

			if (participantError) {
				console.error('Error removing user participation:', participantError);
				return json({ error: 'Failed to leave conversation' }, { status: 500 });
			}

			console.log(`✅ Successfully removed user ${authUser.id} from group conversation ${conversationId}`);
		}

		return json({ success: true });
	} catch (error) {
		console.error('Delete conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});