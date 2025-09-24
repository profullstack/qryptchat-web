// API endpoint for encrypted file downloads
import { json, error } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { postQuantumEncryption } from '$lib/crypto/post-quantum-encryption.js';

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
		console.log(`📁 [FILE-DOWNLOAD] Download request from auth user: ${user.id} for file: ${fileId}`);

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error('📁 [FILE-DOWNLOAD] Internal user not found:', userError);
			return error(404, 'User profile not found');
		}

		const userId = internalUser.id;
		console.log(`📁 [FILE-DOWNLOAD] Using internal user: ${userId} for file: ${fileId}`);

		// Get file metadata from database
		// Fix the relationship path: messages -> conversations -> conversation_participants
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
			console.error('📁 [FILE-DOWNLOAD] File not found or unauthorized:', fileError);
			return error(404, 'File not found or unauthorized');
		}

		// Display filename will be extracted from encrypted content or fallback to generic name
		let displayFilename = 'encrypted-file';
		console.log(`📁 [FILE-DOWNLOAD] Processing encrypted file: ${fileId}`);

		// Download encrypted file from storage
		const { data: storageData, error: storageError } = await supabase.storage
			.from('encrypted-files')
			.download(fileData.storage_path);

		if (storageError || !storageData) {
			console.error('📁 [FILE-DOWNLOAD] Storage download failed:', storageError);
			return error(500, 'Failed to download file from storage');
		}

		// Parse the encrypted contents (multi-recipient format)
		const encryptedContentsJson = await storageData.text();
		const encryptedContents = JSON.parse(encryptedContentsJson);

		console.log(`📁 [FILE-DOWNLOAD] Decrypting file for auth user: ${user.id}, internal user: ${userId}`);

		// Initialize post-quantum encryption
		await postQuantumEncryption.initialize();

		// Decrypt the file using the user's encrypted copy (keyed by internal user ID, not auth user ID)
		console.log(`📁 [FILE-DOWNLOAD] Available encrypted keys:`, Object.keys(encryptedContents));
		const userEncryptedCopy = encryptedContents[userId] || encryptedContents[user.id];
		
		if (!userEncryptedCopy) {
			console.error(`📁 [FILE-DOWNLOAD] No encrypted copy found for user ${userId} or ${user.id}`);
			return error(404, 'No encrypted file copy found for user');
		}

		console.log(`📁 [FILE-DOWNLOAD] Using encrypted copy for user ID: ${userEncryptedCopy ? 'found' : 'not found'}`);
		console.log(`📁 [FILE-DOWNLOAD] Encrypted copy preview:`, userEncryptedCopy?.substring(0, 100));

		const decryptedContent = await postQuantumEncryption.decryptFromSender(
			userEncryptedCopy, // User's encrypted copy
			'' // Sender public key not needed for ML-KEM decryption
		);

		console.log(`📁 [FILE-DOWNLOAD] Decrypted content type:`, typeof decryptedContent);
		console.log(`📁 [FILE-DOWNLOAD] Decrypted content length:`, decryptedContent?.length);

		// Parse the decrypted content to extract file metadata and content
		let fileMetadata;
		let actualFileContent;
		
		try {
			// Try to parse as JSON (new format with metadata)
			fileMetadata = JSON.parse(decryptedContent);
			if (fileMetadata.content && fileMetadata.filename) {
				actualFileContent = fileMetadata.content;
				displayFilename = fileMetadata.filename;
				console.log(`📁 [FILE-DOWNLOAD] Using encrypted filename from metadata: ${displayFilename}`);
			} else {
				throw new Error('Invalid metadata format');
			}
		} catch (parseError) {
			// Fallback to treating entire content as base64 file content (legacy format)
			actualFileContent = decryptedContent;
			console.log(`📁 [FILE-DOWNLOAD] Using legacy format, filename from database: ${displayFilename}`);
		}

		// Convert base64 back to binary
		const fileBuffer = Buffer.from(actualFileContent, 'base64');

		console.log(`📁 [FILE-DOWNLOAD] File buffer length:`, fileBuffer.length);
		console.log(`📁 [FILE-DOWNLOAD] File buffer first 10 bytes:`, fileBuffer.slice(0, 10));
		console.log(`📁 [FILE-DOWNLOAD] ✅ File decrypted successfully: ${displayFilename}`);

		// Return decrypted file with correct content length
		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': fileData.mime_type,
				'Content-Length': fileBuffer.length.toString(),
				'Content-Disposition': `attachment; filename="${encodeURIComponent(displayFilename)}"`,
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
export async function HEAD(event) {
	try {
		// Create Supabase server client
		const supabase = createSupabaseServerClient(event);
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return error(401, 'Unauthorized');
		}

		const userId = user.id;
		const fileId = event.params.fileId;

		// Get file metadata from database
		const { data: fileData, error: fileError } = await supabase
			.from('encrypted_files')
			.select(`
				id,
				mime_type,
				file_size,
				created_at,
				messages!inner(
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
			return error(404, 'File not found or unauthorized');
		}

		// Return file headers without content (filename from database fallback)
		return new Response(null, {
			status: 200,
			headers: {
				'Content-Type': fileData.mime_type,
				'Content-Length': fileData.file_size.toString(),
				'Content-Disposition': `attachment; filename="encrypted-file"`,
				'Last-Modified': new Date(fileData.created_at).toUTCString()
			}
		});

	} catch (err) {
		console.error('📁 [FILE-INFO] ❌ Unexpected error:', err);
		return error(500, 'Internal server error');
	}
}

// Get file metadata as JSON
export async function POST(event) {
	try {
		// Create Supabase server client
		const supabase = createSupabaseServerClient(event);
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return error(401, 'Unauthorized');
		}

		const userId = user.id;
		const fileId = event.params.fileId;

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

		// Return file metadata (filename from database fallback, actual filename encrypted in content)
		return json({
			id: fileData.id,
			messageId: fileData.message_id,
			conversationId: fileData.messages[0].conversation_id,
			originalFilename: fileData.original_filename,
			mimeType: fileData.mime_type,
			fileSize: fileData.file_size,
			formattedSize: formatFileSize(fileData.file_size),
			createdAt: fileData.created_at,
			createdBy: fileData.created_by,
			isOwner: fileData.created_by === userId
		});

	} catch (err) {
		console.error('📁 [FILE-INFO] ❌ Unexpected error:', err);
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