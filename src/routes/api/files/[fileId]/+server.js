// API endpoint for encrypted file downloads
import { json, error } from '@sveltejs/kit';
import { supabase } from '$lib/supabase.js';
import { fileEncryption } from '$lib/crypto/file-encryption.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, locals }) {
	try {
		// Check authentication
		const session = await locals.getSession();
		if (!session?.user) {
			return error(401, 'Unauthorized');
		}

		const userId = session.user.id;
		const fileId = params.fileId;

		console.log(`📁 [FILE-DOWNLOAD] Download request from user: ${userId} for file: ${fileId}`);

		// Get file metadata from database
		const { data: fileData, error: fileError } = await supabase
			.from('encrypted_files')
			.select(`
				id,
				message_id,
				storage_path,
				original_filename,
				mime_type,
				file_size,
				encrypted_metadata,
				created_at,
				messages!inner(
					id,
					conversation_id,
					conversation_participants!inner(
						user_id
					)
				)
			`)
			.eq('id', fileId)
			.eq('messages.conversation_participants.user_id', userId)
			.single();

		if (fileError || !fileData) {
			console.error('📁 [FILE-DOWNLOAD] File not found or unauthorized:', fileError);
			return error(404, 'File not found or unauthorized');
		}

		console.log(`📁 [FILE-DOWNLOAD] Found file: ${fileData.original_filename}`);

		// Download encrypted file from storage
		const { data: storageData, error: storageError } = await supabase.storage
			.from('encrypted-files')
			.download(fileData.storage_path);

		if (storageError || !storageData) {
			console.error('📁 [FILE-DOWNLOAD] Storage download failed:', storageError);
			return error(500, 'Failed to download file from storage');
		}

		// Convert blob to text (encrypted content)
		const encryptedContent = await storageData.text();

		// Get conversation ID for decryption
		const conversationId = fileData.messages.conversation_id;

		console.log(`📁 [FILE-DOWNLOAD] Decrypting file for conversation: ${conversationId}`);

		// Decrypt file
		await fileEncryption.initialize();
		const { fileContent } = await fileEncryption.decryptFile(
			conversationId,
			encryptedContent,
			fileData.encrypted_metadata
		);

		console.log(`📁 [FILE-DOWNLOAD] ✅ File decrypted successfully: ${fileData.original_filename}`);

		// Return decrypted file
		return new Response(fileContent, {
			status: 200,
			headers: {
				'Content-Type': fileData.mime_type,
				'Content-Length': fileData.file_size.toString(),
				'Content-Disposition': `attachment; filename="${encodeURIComponent(fileData.original_filename)}"`,
				'Cache-Control': 'private, no-cache, no-store, must-revalidate',
				'Pragma': 'no-cache',
				'Expires': '0'
			}
		});

	} catch (err) {
		console.error('📁 [FILE-DOWNLOAD] ❌ Unexpected error:', err);
		return error(500, 'Internal server error during file download');
	}
}

// Get file info without downloading the actual file content
export async function HEAD({ params, locals }) {
	try {
		// Check authentication
		const session = await locals.getSession();
		if (!session?.user) {
			return error(401, 'Unauthorized');
		}

		const userId = session.user.id;
		const fileId = params.fileId;

		// Get file metadata from database
		const { data: fileData, error: fileError } = await supabase
			.from('encrypted_files')
			.select(`
				id,
				original_filename,
				mime_type,
				file_size,
				created_at,
				messages!inner(
					conversation_participants!inner(
						user_id
					)
				)
			`)
			.eq('id', fileId)
			.eq('messages.conversation_participants.user_id', userId)
			.single();

		if (fileError || !fileData) {
			return error(404, 'File not found or unauthorized');
		}

		// Return file headers without content
		return new Response(null, {
			status: 200,
			headers: {
				'Content-Type': fileData.mime_type,
				'Content-Length': fileData.file_size.toString(),
				'Content-Disposition': `attachment; filename="${encodeURIComponent(fileData.original_filename)}"`,
				'Last-Modified': new Date(fileData.created_at).toUTCString()
			}
		});

	} catch (err) {
		console.error('📁 [FILE-INFO] ❌ Unexpected error:', err);
		return error(500, 'Internal server error');
	}
}

// Get file metadata as JSON
export async function POST({ params, locals }) {
	try {
		// Check authentication
		const session = await locals.getSession();
		if (!session?.user) {
			return error(401, 'Unauthorized');
		}

		const userId = session.user.id;
		const fileId = params.fileId;

		console.log(`📁 [FILE-INFO] Info request from user: ${userId} for file: ${fileId}`);

		// Get file metadata from database
		const { data: fileData, error: fileError } = await supabase
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
			.eq('id', fileId)
			.eq('messages.conversation_participants.user_id', userId)
			.single();

		if (fileError || !fileData) {
			console.error('📁 [FILE-INFO] File not found or unauthorized:', fileError);
			return error(404, 'File not found or unauthorized');
		}

		// Return file metadata
		return json({
			id: fileData.id,
			messageId: fileData.message_id,
			conversationId: fileData.messages.conversation_id,
			originalFilename: fileData.original_filename,
			mimeType: fileData.mime_type,
			fileSize: fileData.file_size,
			formattedSize: fileEncryption.formatFileSize(fileData.file_size),
			createdAt: fileData.created_at,
			createdBy: fileData.created_by,
			isOwner: fileData.created_by === userId
		});

	} catch (err) {
		console.error('📁 [FILE-INFO] ❌ Unexpected error:', err);
		return error(500, 'Internal server error');
	}
}