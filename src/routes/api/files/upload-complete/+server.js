// API endpoint for completing direct file upload after successful upload to Supabase Storage
import { json, error } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { metadataEncryption } from '$lib/crypto/metadata-encryption.js';

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

		const { messageId, conversationId, originalFilename, mimeType, fileSize } = metadata;

		if (!messageId || !conversationId || !originalFilename || !mimeType || fileSize == null) {
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

		console.log(`📁 [UPLOAD-COMPLETE] Processing completion for: ${originalFilename} (${fileSize} bytes)`);

		// Prepare metadata object
		const metadataObj = {
			id: fileId,
			mimeType: mimeType,
			size: parseInt(fileSize),
			encryptedAt: new Date().toISOString(),
			version: 3 // Version 3 = multi-recipient encryption with embedded filename
		};

		// Encrypt metadata for all conversation participants
		let encryptedMetadata;
		try {
			console.log(`📁 [UPLOAD-COMPLETE] Encrypting metadata for conversation participants`);
			encryptedMetadata = await metadataEncryption.encryptMetadata(conversationId, metadataObj, supabase);
			console.log(`📁 [UPLOAD-COMPLETE] ✅ Metadata encrypted successfully`);
		} catch (encryptError) {
			console.error(`📁 [UPLOAD-COMPLETE] ❌ Failed to encrypt metadata:`, encryptError);
			// Fall back to storing unencrypted metadata if encryption fails
			// This ensures backward compatibility and prevents upload failures
			encryptedMetadata = metadataObj;
			console.warn(`📁 [UPLOAD-COMPLETE] ⚠️ Storing unencrypted metadata as fallback`);
		}

		// Save file metadata to database
		const { data: dbData, error: dbError } = await supabase
			.from('encrypted_files')
			.insert({
				message_id: messageId,
				storage_path: storagePath,
				mime_type: mimeType,
				file_size: parseInt(fileSize),
				encrypted_metadata: encryptedMetadata,
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

		console.log(`📁 [UPLOAD-COMPLETE] ✅ File upload completed successfully: ${originalFilename}`);

		// Return success response
		return json({
			success: true,
			file: {
				id: dbData.id,
				messageId: messageId,
				originalFilename: originalFilename,
				mimeType: mimeType,
				fileSize: parseInt(fileSize),
				formattedSize: formatFileSize(parseInt(fileSize)),
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