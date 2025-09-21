// API endpoint for encrypted file uploads
import { json, error } from '@sveltejs/kit';
import { supabase } from '$lib/supabase.js';
import { fileEncryption } from '$lib/crypto/file-encryption.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, locals }) {
	try {
		// Check authentication
		const session = await locals.getSession();
		if (!session?.user) {
			return error(401, 'Unauthorized');
		}

		const userId = session.user.id;
		console.log(`📁 [FILE-UPLOAD] Upload request from user: ${userId}`);

		// Parse the multipart form data
		const formData = await request.formData();
		const file = formData.get('file');
		const conversationId = formData.get('conversationId');
		const messageId = formData.get('messageId');

		// Validate inputs
		if (!file || !(file instanceof File)) {
			console.error('📁 [FILE-UPLOAD] No file provided or invalid file');
			return error(400, 'No file provided');
		}

		if (!conversationId || !messageId) {
			console.error('📁 [FILE-UPLOAD] Missing conversationId or messageId');
			return error(400, 'Missing conversationId or messageId');
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

		// Validate file type and size
		if (!fileEncryption.isAllowedFileType(file.name)) {
			console.error(`📁 [FILE-UPLOAD] File type not allowed: ${file.name}`);
			return error(400, `File type not allowed: ${fileEncryption.getFileExtension(file.name)}`);
		}

		if (!fileEncryption.isValidFileSize(file.size)) {
			console.error(`📁 [FILE-UPLOAD] File too large: ${file.size} bytes`);
			return error(400, `File too large. Maximum size is ${Math.floor(fileEncryption.maxFileSize / (1024 * 1024))}MB`);
		}

		console.log(`📁 [FILE-UPLOAD] Processing file: ${file.name} (${file.size} bytes)`);

		// Read file content
		const arrayBuffer = await file.arrayBuffer();
		const fileContent = new Uint8Array(arrayBuffer);

		// Encrypt file
		await fileEncryption.initialize();
		const { encryptedData, metadata } = await fileEncryption.encryptFile(
			conversationId,
			fileContent,
			file.name,
			file.type
		);

		// Generate storage path: userId/conversationId/fileId
		const storagePath = `${userId}/${conversationId}/${metadata.id}`;

		console.log(`📁 [FILE-UPLOAD] Uploading encrypted file to: ${storagePath}`);

		// Upload encrypted file to Supabase storage
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from('encrypted-files')
			.upload(storagePath, Buffer.from(encryptedData), {
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
				original_filename: file.name,
				mime_type: file.type,
				file_size: file.size,
				encrypted_metadata: metadata,
				created_by: userId
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

		console.log(`📁 [FILE-UPLOAD] ✅ File upload completed successfully: ${file.name}`);

		// Return success response
		return json({
			success: true,
			file: {
				id: dbData.id,
				messageId: messageId,
				originalFilename: file.name,
				mimeType: file.type,
				fileSize: file.size,
				formattedSize: fileEncryption.formatFileSize(file.size),
				createdAt: dbData.created_at
			}
		});

	} catch (err) {
		console.error('📁 [FILE-UPLOAD] ❌ Unexpected error:', err);
		return error(500, 'Internal server error during file upload');
	}
}