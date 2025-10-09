// API endpoint to get encrypted file data for client-side decryption
import { json, error } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

export async function GET(event) {
	try {
		// Create Supabase server client
		const supabase = createSupabaseServerClient(event);
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return error(401, 'Unauthorized');
		}

		const fileId = event.params.fileId;
		console.log(`📁 [ENCRYPTED-FILE] Request from auth user: ${user.id} for file: ${fileId}`);

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error('📁 [ENCRYPTED-FILE] Internal user not found:', userError);
			return error(404, 'User profile not found');
		}

		const userId = internalUser.id;
		console.log(`📁 [ENCRYPTED-FILE] Using internal user: ${userId} for file: ${fileId}`);

		// Get file metadata from database
		const { data: fileData, error: fileError } = await supabase
			.from('encrypted_files')
			.select(`
				id,
				message_id,
				storage_path,
				mime_type,
				file_size,
				encrypted_metadata,
				created_at,
				messages!inner(
					id,
					conversation_id,
					conversations!inner(
						id,
						conversation_participants!inner(
							user_id
						)
					)
				)
			`)
			.eq('id', fileId)
			.eq('messages.conversations.conversation_participants.user_id', userId)
			.single();

		if (fileError || !fileData) {
			console.error('📁 [ENCRYPTED-FILE] File not found or unauthorized:', fileError);
			return error(404, 'File not found or unauthorized');
		}

		console.log(`📁 [ENCRYPTED-FILE] Found encrypted file: ${fileId}`);

		// Download encrypted file from storage
		const { data: storageData, error: storageError } = await supabase.storage
			.from('encrypted-files')
			.download(fileData.storage_path);

		if (storageError || !storageData) {
			console.error('📁 [ENCRYPTED-FILE] Storage download failed:', storageError);
			return error(500, 'Failed to download file from storage');
		}

		// Get the encrypted contents as text
		const encryptedContentsJson = await storageData.text();

		console.log(`📁 [ENCRYPTED-FILE] ✅ Retrieved encrypted file data: ${fileId}`);

		// Return encrypted file data for client-side decryption
		// Note: filename is encrypted within the file contents JSON, not in database
		// The encrypted_metadata field contains auxiliary info (not sensitive data)
		return json({
			success: true,
			file: {
				id: fileData.id,
				messageId: fileData.message_id,
				originalFilename: 'encrypted-file', // Filename is encrypted in content
				mimeType: fileData.mime_type,
				fileSize: fileData.file_size,
				encryptedContents: encryptedContentsJson,
				metadata: fileData.encrypted_metadata // Auxiliary metadata (not sensitive)
			}
		});

	} catch (err) {
		console.error('📁 [ENCRYPTED-FILE] ❌ Unexpected error:', err);
		return error(500, 'Internal server error');
	}
}