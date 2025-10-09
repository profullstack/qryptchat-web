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
		const encryptedMetadata = formData.get('encryptedMetadata');
		const conversationId = formData.get('conversationId');
		const messageId = formData.get('messageId');

		// Validate inputs
		if (!encryptedContents) {
			console.error('📁 [FILE-UPLOAD] No encrypted content provided');
			return error(400, 'No encrypted content provided');
		}

		// Check for missing or empty required fields
		const missingFields = [];
		if (!conversationId) missingFields.push('conversationId');
		if (!messageId) missingFields.push('messageId');
		if (!encryptedMetadata) missingFields.push('encryptedMetadata');

		if (missingFields.length > 0) {
			console.error('📁 [FILE-UPLOAD] Missing required fields:', missingFields.join(', '));
			return error(400, `Missing required fields: ${missingFields.join(', ')}`);
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

		console.log(`📁 [FILE-UPLOAD] Processing encrypted file with encrypted metadata`);

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

		// This endpoint is deprecated - use /api/files/upload-url + /api/files/upload-complete instead
		// The new flow supports E2E encrypted metadata
		return error(501, 'This upload method is deprecated. Use /api/files/upload-url for E2E encrypted uploads.');

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