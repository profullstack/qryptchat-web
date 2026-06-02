// API endpoint for completing direct file upload after successful upload to Supabase Storage
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { sseManager } from '@/lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '@/lib/api/protocol.js';

export async function POST(request, { params } = {}) {
	try {
		// Create Supabase server client
		const supabase = createSupabaseServerClient();
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		console.log(`📁 [UPLOAD-COMPLETE] Upload completion from auth user: ${user.id}`);

		// Parse the JSON request body
		const {
			storagePath,
			fileId,
			metadata
		} = await request.NextResponse.json();

		// Validate inputs
		if (!storagePath || !fileId || !metadata) {
			console.error( '📁 [UPLOAD-COMPLETE] Missing required fields');
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
		}

		const { messageId, conversationId, encryptedMetadata } = metadata;

		if (!messageId || !conversationId || !encryptedMetadata) {
			console.error( '📁 [UPLOAD-COMPLETE] Missing metadata fields');
			return NextResponse.json({ error: 'Missing metadata fields' }, { status: 400 });
		}

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error( '📁 [UPLOAD-COMPLETE] Internal user not found:', userError);
			return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
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
			console.error( '📁 [UPLOAD-COMPLETE] User not authorized for conversation:', participantError);
			return NextResponse.json({ error: 'Not authorized to complete upload for this conversation' }, { status: 403 });
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
			console.error( '📁 [UPLOAD-COMPLETE] Message not found or unauthorized:', messageError);
			return NextResponse.json({ error: 'Message not found or unauthorized' }, { status: 404 });
		}

		// Verify the file exists in storage (this confirms the upload was successful)
		const { data: fileExists, error: fileError } = await supabase.storage
			.from('encrypted-files')
			.list(storagePath.substring(0, storagePath.lastIndexOf('/')), {
				limit: 1,
				search: storagePath.substring(storagePath.lastIndexOf('/') + 1)
			});

		if (fileError || !fileExists || fileExists.length === 0) {
			console.error( '📁 [UPLOAD-COMPLETE] File not found in storage:', fileError);
			return NextResponse.json({ error: 'File not found in storage - upload may have failed' }, { status: 404 });
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
			console.error( '📁 [UPLOAD-COMPLETE] Database insert failed:', dbError);
			
			// Clean up uploaded file on database error
			await supabase.storage
				.from('encrypted-files')
				.remove([storagePath]);
				
			return NextResponse.json({ error: 'Failed to save file metadata' }, { status: 500 });
		}

		console.log(`📁 [UPLOAD-COMPLETE] ✅ File upload completed successfully for message: ${messageId}`);

		// Verify the message exists and has the attachment flag set
		const { data: verifyMessage, error: verifyError } = await supabase
			.from('messages')
			.select('id, has_attachments, conversation_id')
			.eq('id', messageId)
			.single();

		if (verifyError) {
			console.error( `📁 [UPLOAD-COMPLETE] ⚠️ Could not verify message:`, verifyError);
		} else {
			console.log(`📁 [UPLOAD-COMPLETE] Message verification:`, {
				messageId: verifyMessage.id,
				has_attachments: verifyMessage.has_attachments,
				conversation_id: verifyMessage.conversation_id
			});
		}

		// Broadcast a simple notification that files were added to the message
		// Clients will reload messages to see the updated message with attachments
		console.log(`📁 [UPLOAD-COMPLETE] Broadcasting file upload completion via SSE to conversation: ${conversationId}`);
		sseManager.broadcastToRoom(conversationId, MESSAGE_TYPES.NEW_MESSAGE, {
			message: { id: messageId, conversation_id: conversationId, has_attachments: true },
			shouldReloadMessages: true // Signal clients to reload messages to get file attachments
		});
		console.log(`📁 [UPLOAD-COMPLETE] ✅ SSE broadcast sent`);

		// Return success response
		return NextResponse.json({
			success: true,
			file: {
				id: dbData.id,
				messageId: messageId,
				createdAt: dbData.created_at
			}
		});

	} catch (err) {
		console.error( '📁 [UPLOAD-COMPLETE] ❌ Unexpected error:', err);
		return NextResponse.json({ error: 'Internal server error during upload completion' }, { status: 500 });
	}
}

function formatFileSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}