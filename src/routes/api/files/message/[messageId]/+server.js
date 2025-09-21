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

		const userId = user.id;
		const messageId = event.params.messageId;

		console.log(`📁 [FILES-BY-MESSAGE] Request from user: ${userId} for message: ${messageId}`);

		// Get files for the message, ensuring user has access
		const { data: files, error: filesError } = await supabase
			.from('encrypted_files')
			.select(`
				id,
				message_id,
				original_filename,
				mime_type,
				file_size,
				created_at,
				created_by,
				messages!inner(
					id,
					conversation_id,
					conversation_participants!inner(
						user_id
					)
				)
			`)
			.eq('message_id', messageId)
			.eq('messages.conversation_participants.user_id', userId);

		if (filesError) {
			console.error('📁 [FILES-BY-MESSAGE] Database error:', filesError);
			return error(500, 'Failed to fetch files');
		}

		if (!files || files.length === 0) {
			console.log(`📁 [FILES-BY-MESSAGE] No files found for message: ${messageId}`);
			return json({ files: [] });
		}

		console.log(`📁 [FILES-BY-MESSAGE] Found ${files.length} files for message: ${messageId}`);

		// Format file data for frontend
		const formattedFiles = files.map(file => ({
			id: file.id,
			messageId: file.message_id,
			originalFilename: file.original_filename,
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