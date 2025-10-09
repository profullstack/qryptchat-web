// API endpoint for completing direct file upload after successful upload to Supabase Storage
import { json, error } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { sseManager } from '$lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';

export async function POST(event) {
	try {
		// Create Supabase server client
		const supabase = createSupabaseServerClient(event);
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return error(401, 'Unauthorized');
		}

		console.log(`📁 [UPLOAD-COMPLETE] Upload completion from auth user: ${user.id}`);

		// Parse the JSON request body
		const {
			storagePath,
			fileId,
			metadata
		} = await event.request.json();

		// Validate inputs
		if (!storagePath || !fileId || !metadata) {
			console.error('📁 [UPLOAD-COMPLETE] Missing required fields');
			return error(400, 'Missing required fields');
		}

		const { messageId, conversationId, encryptedMetadata } = metadata;

		if (!messageId || !conversationId || !encryptedMetadata) {
			console.error('📁 [UPLOAD-COMPLETE] Missing metadata fields');
			return error(400, 'Missing metadata fields');
		}

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error('📁 [UPLOAD-COMPLETE] Internal user not found:', userError);
			return error(404, 'User profile not found');
		}

		const userId = internalUser.id;
		console.log(`📁 [UPLOAD-COMPLETE] Using internal user ID: ${userId}`);

		// Validate user has access to the conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('user_id')
			.eq('conversation_id', conversationId)
			.eq('user_id', userId)
			.single();

		if (participantError || !participant) {
			console.error('📁 [UPLOAD-COMPLETE] User not authorized for conversation:', participantError);
			return error(403, 'Not authorized to complete upload for this conversation');
		}

		// Validate message exists and belongs to the conversation
		const { data: message, error: messageError } = await supabase
			.from('messages')
			.select('id, conversation_id, sender_id')
			.eq('id', messageId)
			.eq('conversation_id', conversationId)
			.eq('sender_id', userId)
			.single();

		if (messageError || !message) {
			console.error('📁 [UPLOAD-COMPLETE] Message not found or unauthorized:', messageError);
			return error(404, 'Message not found or unauthorized');
		}

		// Verify the file exists in storage (this confirms the upload was successful)
		const { data: fileExists, error: fileError } = await supabase.storage
			.from('encrypted-files')
			.list(storagePath.substring(0, storagePath.lastIndexOf('/')), {
				limit: 1,
				search: storagePath.substring(storagePath.lastIndexOf('/') + 1)
			});

		if (fileError || !fileExists || fileExists.length === 0) {
			console.error('📁 [UPLOAD-COMPLETE] File not found in storage:', fileError);
			return error(404, 'File not found in storage - upload may have failed');
		}

		console.log(`📁 [UPLOAD-COMPLETE] Processing completion for encrypted file`);

		// Save file metadata to database
		// The encrypted_metadata is already encrypted client-side for all conversation participants
		// mime_type and file_size columns have been removed - all metadata is now E2E encrypted
		const { data: dbData, error: dbError } = await supabase
			.from('encrypted_files')
			.insert({
				message_id: messageId,
				storage_path: storagePath,
				encrypted_metadata: encryptedMetadata, // Store encrypted metadata from client
				created_by: user.id // Use auth user ID for RLS policy compatibility
			})
			.select()
			.single();

		if (dbError) {
			console.error('📁 [UPLOAD-COMPLETE] Database insert failed:', dbError);
			
			// Clean up uploaded file on database error
			await supabase.storage
				.from('encrypted-files')
				.remove([storagePath]);
				
			return error(500, 'Failed to save file metadata');
		}

		console.log(`📁 [UPLOAD-COMPLETE] ✅ File upload completed successfully`);

		// Broadcast a simple notification that files were added to the message
		// Clients will reload messages to see the updated message with attachments
		console.log(`📁 [UPLOAD-COMPLETE] Broadcasting file upload completion via SSE`);
		sseManager.broadcastToRoom(conversationId, MESSAGE_TYPES.NEW_MESSAGE, {
			message: { id: messageId, conversation_id: conversationId, has_attachments: true },
			shouldReloadMessages: true // Signal clients to reload messages to get file attachments
		});

		// Return success response
		return json({
			success: true,
			file: {
				id: dbData.id,
				messageId: messageId,
				createdAt: dbData.created_at
			}
		});

	} catch (err) {
		console.error('📁 [UPLOAD-COMPLETE] ❌ Unexpected error:', err);
		return error(500, 'Internal server error during upload completion');
	}
}

function formatFileSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}