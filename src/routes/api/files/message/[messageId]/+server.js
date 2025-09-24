// API endpoint to get files for a specific message
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

		const messageId = event.params.messageId;
		console.log(`📁 [FILES-BY-MESSAGE] Request from auth user: ${user.id} for message: ${messageId}`);

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error('📁 [FILES-BY-MESSAGE] Internal user not found:', userError);
			return error(404, 'User profile not found');
		}

		const userId = internalUser.id;

		console.log(`📁 [FILES-BY-MESSAGE] Using internal user: ${userId} for message: ${messageId}`);

		// Get files for the message, ensuring user has access
		// Fix the relationship path: messages -> conversations -> conversation_participants
		const { data: files, error: filesError } = await supabase
			.from('encrypted_files')
			.select(`
				id,
				message_id,
				mime_type,
				file_size,
				created_at,
				created_by,
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
			.eq('message_id', messageId)
			.eq('messages.conversations.conversation_participants.user_id', userId);

		if (filesError) {
			console.error('📁 [FILES-BY-MESSAGE] Database error:', filesError);
			return error(500, 'Failed to fetch files');
		}

		if (!files || files.length === 0) {
			console.log(`📁 [FILES-BY-MESSAGE] No files found for message: ${messageId}`);
			return json({ files: [] });
		}

		console.log(`📁 [FILES-BY-MESSAGE] Found ${files.length} files for message: ${messageId}`);

		// Format file data for frontend (filename will be extracted client-side from encrypted content)
		const formattedFiles = files.map(file => ({
			id: file.id,
			messageId: file.message_id,
			originalFilename: 'encrypted-file', // Filename is encrypted in content, extracted client-side
			mimeType: file.mime_type,
			fileSize: file.file_size,
			createdAt: file.created_at,
			createdBy: file.created_by,
			isOwner: file.created_by === userId
		}));

		return json({ files: formattedFiles });

	} catch (err) {
		console.error('📁 [FILES-BY-MESSAGE] ❌ Unexpected error:', err);
		return error(500, 'Internal server error');
	}
}

function formatFileSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}