/**
 * @fileoverview Delete Conversation API Endpoint
 * Handles removing a user's participation and their data from a conversation
 * For direct messages: deletes the entire conversation if user is a participant
 * For groups: only removes the user's participation and their messages/files
 */

import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { getServiceRoleClient } from '$lib/supabase/service-role.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.json();

		if (!conversationId) {
			return json({ error: 'Missing conversationId' }, { status: 400 });
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
			return json({ error: 'User not found' }, { status: 404 });
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
			return json({
				error: 'Database error checking participation'
			}, { status: 500 });
		}

		if (!participant) {
			console.error('❌ User not a participant:', {
				conversationId,
				userId: authUser.id
			});
			return json({
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

			// Use service role client to bypass RLS policies for deletion
			const serviceClient = getServiceRoleClient();
			console.log('🔑 Using service role client to bypass RLS for deletion');

			// Step 1: Get all message IDs for this conversation
			const { data: messages, error: messagesQueryError } = await serviceClient
				.from('messages')
				.select('id')
				.eq('conversation_id', conversationId);

			if (messagesQueryError) {
				console.error('Error querying messages:', messagesQueryError);
				return json({ error: 'Failed to query messages' }, { status: 500 });
			}

			const messageIds = messages?.map(m => m.id) || [];

			// Step 2: Delete SMS notifications (references conversation_id and message_id)
			if (messageIds.length > 0) {
				const { error: smsError } = await serviceClient
					.from('sms_notifications')
					.delete()
					.in('message_id', messageIds);

				if (smsError) {
					console.error('Error deleting SMS notifications:', smsError);
				}
			}

			// Also delete SMS notifications by conversation_id
			const { error: smsConvError } = await serviceClient
				.from('sms_notifications')
				.delete()
				.eq('conversation_id', conversationId);

			if (smsConvError) {
				console.error('Error deleting SMS notifications by conversation:', smsConvError);
			}

			// Step 3: Delete deliveries (references message_id)
			if (messageIds.length > 0) {
				const { error: deliveriesError } = await serviceClient
					.from('deliveries')
					.delete()
					.in('message_id', messageIds);

				if (deliveriesError) {
					console.error('Error deleting deliveries:', deliveriesError);
				}
			}

			// Step 4: Delete message_recipients (references message_id)
			if (messageIds.length > 0) {
				const { error: recipientsError } = await serviceClient
					.from('message_recipients')
					.delete()
					.in('message_id', messageIds);

				if (recipientsError) {
					console.error('Error deleting message recipients:', recipientsError);
				}
			}

			// Step 5: Delete message_status (references message_id)
			if (messageIds.length > 0) {
				const { error: statusError } = await serviceClient
					.from('message_status')
					.delete()
					.in('message_id', messageIds);

				if (statusError) {
					console.error('Error deleting message status:', statusError);
				}
			}

			// Step 6: Delete encrypted_files (references message_id)
			if (messageIds.length > 0) {
				const { error: encryptedFilesError } = await serviceClient
					.from('encrypted_files')
					.delete()
					.in('message_id', messageIds);

				if (encryptedFilesError) {
					console.error('Error deleting encrypted files:', encryptedFilesError);
				}
			}

			// Step 7: Delete all messages
			const { error: messagesError } = await serviceClient
				.from('messages')
				.delete()
				.eq('conversation_id', conversationId);

			if (messagesError) {
				console.error('Error deleting messages:', messagesError);
				return json({ error: 'Failed to delete messages' }, { status: 500 });
			}

			// Step 8: Delete typing_indicators
			const { error: typingError } = await serviceClient
				.from('typing_indicators')
				.delete()
				.eq('conversation_id', conversationId);

			if (typingError) {
				console.error('Error deleting typing indicators:', typingError);
			}

			// Step 9: Delete all participants
			const { error: participantsError } = await serviceClient
				.from('conversation_participants')
				.delete()
				.eq('conversation_id', conversationId);

			if (participantsError) {
				console.error('Error deleting participants:', participantsError);
				return json({ error: 'Failed to delete participants' }, { status: 500 });
			}

			// Step 10: Delete the conversation
			const { error: conversationError } = await serviceClient
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
			console.log(`Removing user ${internalUserId} from group conversation ${conversationId}`);

			// Delete only the user's messages
			const { error: messagesError } = await supabase
				.from('messages')
				.delete()
				.eq('conversation_id', conversationId)
				.eq('sender_id', internalUserId);

			if (messagesError) {
				console.error('Error deleting user messages:', messagesError);
				return json({ error: 'Failed to delete your messages' }, { status: 500 });
			}

			// Delete only the user's file attachments
			const { error: filesError } = await supabase
				.from('file_attachments')
				.delete()
				.eq('conversation_id', conversationId)
				.eq('uploaded_by', internalUserId);

			if (filesError) {
				console.error('Error deleting user file attachments:', filesError);
			}

			// Remove user's participation
			const { error: participantError } = await supabase
				.from('conversation_participants')
				.delete()
				.eq('conversation_id', conversationId)
				.eq('user_id', internalUserId);

			if (participantError) {
				console.error('Error removing user participation:', participantError);
				return json({ error: 'Failed to leave conversation' }, { status: 500 });
			}

			console.log(`✅ Successfully removed user ${internalUserId} from group conversation ${conversationId}`);
		}

		return json({ success: true });
	} catch (error) {
		console.error('Delete conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});