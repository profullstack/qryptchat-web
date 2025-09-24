// API endpoint for encrypted file uploads
import { json, error } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

export async function POST(event) {
	try {
		// Create Supabase server client
		const supabase = createSupabaseServerClient(event);
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return error(401, 'Unauthorized');
		}

		console.log(`📁 [FILE-UPLOAD] Upload request from auth user: ${user.id}`);

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error('📁 [FILE-UPLOAD] Internal user not found:', userError);
			return error(404, 'User profile not found');
		}

		const userId = internalUser.id;
		console.log(`📁 [FILE-UPLOAD] Using internal user ID: ${userId}`);

		// Parse the multipart form data
		const formData = await event.request.formData();
		const encryptedContents = formData.get('encryptedContents');
		const originalFilename = formData.get('originalFilename');
		const mimeType = formData.get('mimeType');
		const fileSize = formData.get('fileSize');
		const conversationId = formData.get('conversationId');
		const messageId = formData.get('messageId');

		// Validate inputs
		if (!encryptedContents) {
			console.error('📁 [FILE-UPLOAD] No encrypted content provided');
			return error(400, 'No encrypted content provided');
		}

		if (!conversationId || !messageId || !originalFilename || !mimeType || !fileSize) {
			console.error('📁 [FILE-UPLOAD] Missing required fields');
			return error(400, 'Missing required fields');
		}

		// Validate user has access to the conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('user_id')
			.eq('conversation_id', conversationId)
			.eq('user_id', userId)
			.single();

		if (participantError || !participant) {
			console.error('📁 [FILE-UPLOAD] User not authorized for conversation:', participantError);
			return error(403, 'Not authorized to upload files to this conversation');
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
			console.error('📁 [FILE-UPLOAD] Message not found or unauthorized:', messageError);
			return error(404, 'Message not found or unauthorized');
		}

		console.log(`📁 [FILE-UPLOAD] Processing encrypted file: ${originalFilename} (${fileSize} bytes)`);

		// Generate file ID and storage path (use auth user ID for storage path to match RLS policy)
		const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
		const storagePath = `${user.id}/${conversationId}/${fileId}`;

		console.log(`📁 [FILE-UPLOAD] Uploading encrypted file to: ${storagePath}`);

		// Upload encrypted file contents to Supabase storage
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from('encrypted-files')
			.upload(storagePath, encryptedContents, {
				contentType: 'application/octet-stream',
				cacheControl: '3600',
				upsert: false
			});

		if (uploadError) {
			console.error('📁 [FILE-UPLOAD] Storage upload failed:', uploadError);
			return error(500, 'Failed to upload file to storage');
		}

		console.log(`📁 [FILE-UPLOAD] File uploaded successfully:`, uploadData);

		// Save file metadata to database
		const { data: dbData, error: dbError } = await supabase
			.from('encrypted_files')
			.insert({
				message_id: messageId,
				storage_path: storagePath,
				mime_type: mimeType,
				file_size: parseInt(fileSize),
				encrypted_metadata: {
					id: fileId,
					mimeType: mimeType,
					size: parseInt(fileSize),
					encryptedAt: new Date().toISOString(),
					version: 3 // Version 3 = multi-recipient encryption with embedded filename
				},
				created_by: user.id // Use auth user ID for RLS policy compatibility
			})
			.select()
			.single();

		if (dbError) {
			console.error('📁 [FILE-UPLOAD] Database insert failed:', dbError);
			
			// Clean up uploaded file on database error
			await supabase.storage
				.from('encrypted-files')
				.remove([storagePath]);
				
			return error(500, 'Failed to save file metadata');
		}

		console.log(`📁 [FILE-UPLOAD] ✅ File upload completed successfully: ${originalFilename}`);

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
		console.error('📁 [FILE-UPLOAD] ❌ Unexpected error:', err);
		return error(500, 'Internal server error during file upload');
	}
}

function formatFileSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}