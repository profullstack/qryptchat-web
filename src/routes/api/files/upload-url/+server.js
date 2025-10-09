// API endpoint for generating signed upload URLs for direct file upload to Supabase Storage
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

		console.log(`📁 [UPLOAD-URL] Signed URL request from auth user: ${user.id}`);

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error('📁 [UPLOAD-URL] Internal user not found:', userError);
			return error(404, 'User profile not found');
		}

		const userId = internalUser.id;
		console.log(`📁 [UPLOAD-URL] Using internal user ID: ${userId}`);

		// Parse the JSON request body (should be small - just encrypted metadata)
		const {
			conversationId,
			messageId,
			encryptedMetadata
		} = await event.request.json();

		// Validate inputs
		if (!conversationId || !messageId || !encryptedMetadata) {
			console.error('📁 [UPLOAD-URL] Missing required fields');
			return error(400, 'Missing required fields');
		}
		
		// Extract one encrypted copy to get file size for validation
		// We can't decrypt it, but we can get the size from any user's copy
		const firstUserId = Object.keys(encryptedMetadata)[0];
		if (!firstUserId) {
			console.error('📁 [UPLOAD-URL] No encrypted metadata found');
			return error(400, 'Invalid encrypted metadata');
		}

		// Validate user has access to the conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('user_id')
			.eq('conversation_id', conversationId)
			.eq('user_id', userId)
			.single();

		if (participantError || !participant) {
			console.error('📁 [UPLOAD-URL] User not authorized for conversation:', participantError);
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
			console.error('📁 [UPLOAD-URL] Message not found or unauthorized:', messageError);
			return error(404, 'Message not found or unauthorized');
		}

		console.log(`📁 [UPLOAD-URL] Generating signed URL for encrypted file`);

		// Generate file ID and storage path (use auth user ID for storage path to match RLS policy)
		const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
		const storagePath = `${user.id}/${conversationId}/${fileId}`;

		console.log(`📁 [UPLOAD-URL] Storage path: ${storagePath}`);

		// Create signed upload URL
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from('encrypted-files')
			.createSignedUploadUrl(storagePath);

		if (uploadError) {
			console.error('📁 [UPLOAD-URL] Failed to create signed URL:', uploadError);
			return error(500, 'Failed to create upload URL');
		}

		console.log(`📁 [UPLOAD-URL] ✅ Signed URL generated successfully`);

		// Return the signed upload URL and minimal metadata
		// Do NOT return encryptedMetadata - client already has it
		return json({
			success: true,
			uploadUrl: uploadData.signedUrl,
			storagePath: storagePath,
			fileId: fileId,
			token: uploadData.token, // Include the token for verification
			metadata: {
				messageId,
				conversationId
			}
		});

	} catch (err) {
		console.error('📁 [UPLOAD-URL] ❌ Unexpected error:', err);
		return error(500, 'Internal server error during signed URL generation');
	}
}