/**
 * @fileoverview Delete Conversation API Endpoint
 * Handles permanently deleting a conversation and all associated data for all participants
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

		// First, verify the user is a participant in this conversation
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

		// Delete all messages in the conversation
		const { error: messagesError } = await supabase
			.from('messages')
			.delete()
			.eq('conversation_id', conversationId);

		if (messagesError) {
			console.error('Error deleting messages:', messagesError);
			return json({ error: 'Failed to delete messages' }, { status: 500 });
		}

		// Delete all file attachments associated with the conversation
		const { error: filesError } = await supabase
			.from('file_attachments')
			.delete()
			.eq('conversation_id', conversationId);

		if (filesError) {
			console.error('Error deleting file attachments:', filesError);
			// Continue even if file deletion fails
		}

		// Delete all conversation participants
		const { error: participantsError } = await supabase
			.from('conversation_participants')
			.delete()
			.eq('conversation_id', conversationId);

		if (participantsError) {
			console.error('Error deleting participants:', participantsError);
			return json({ error: 'Failed to delete participants' }, { status: 500 });
		}

		// Finally, delete the conversation itself
		const { error: conversationError } = await supabase
			.from('conversations')
			.delete()
			.eq('id', conversationId);

		if (conversationError) {
			console.error('Error deleting conversation:', conversationError);
			return json({ error: 'Failed to delete conversation' }, { status: 500 });
		}

		console.log(`✅ Successfully deleted conversation ${conversationId} and all associated data`);
		return json({ success: true });
	} catch (error) {
		console.error('Delete conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});