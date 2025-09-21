// API endpoint for encrypted file uploads
import { json, error } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { multiRecipientEncryption } from '$lib/crypto/multi-recipient-encryption.js';

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
		console.log(`📁 [FILE-UPLOAD] Upload request from user: ${userId}`);

		// Parse the multipart form data
		const formData = await event.request.formData();
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
		const maxFileSize = 50 * 1024 * 1024; // 50MB
		const allowedExtensions = [
			'.txt', '.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', 
			'.mp3', '.wav', '.mp4', '.webm', '.zip', '.rar'
		];
		const blockedExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js'];
		
		const getFileExtension = (filename) => {
			const lastDot = filename.lastIndexOf('.');
			return lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
		};
		
		const isAllowedFileType = (filename) => {
			const extension = getFileExtension(filename);
			return !blockedExtensions.includes(extension) && 
				   (!extension || allowedExtensions.includes(extension));
		};

		if (!isAllowedFileType(file.name)) {
			console.error(`📁 [FILE-UPLOAD] File type not allowed: ${file.name}`);
			return error(400, `File type not allowed: ${getFileExtension(file.name)}`);
		}

		if (file.size > maxFileSize) {
			console.error(`📁 [FILE-UPLOAD] File too large: ${file.size} bytes`);
			return error(400, `File too large. Maximum size is ${Math.floor(maxFileSize / (1024 * 1024))}MB`);
		}

		if (file.size === 0) {
			return error(400, 'File cannot be empty');
		}

		console.log(`📁 [FILE-UPLOAD] Processing file: ${file.name} (${file.size} bytes)`);

		// Read file content
		const arrayBuffer = await file.arrayBuffer();
		const fileContent = Buffer.from(arrayBuffer).toString('base64');

		// Initialize multi-recipient encryption
		await multiRecipientEncryption.initialize();

		// Encrypt file for all conversation participants using multi-recipient encryption
		console.log(`📁 [FILE-UPLOAD] Encrypting file for all participants in conversation: ${conversationId}`);
		const encryptedContents = await multiRecipientEncryption.encryptForConversation(conversationId, fileContent);

		// Generate file ID
		const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
		const storagePath = `${userId}/${conversationId}/${fileId}`;

		console.log(`📁 [FILE-UPLOAD] Uploading encrypted file to: ${storagePath}`);

		// Upload encrypted file contents to Supabase storage as JSON
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from('encrypted-files')
			.upload(storagePath, JSON.stringify(encryptedContents), {
				contentType: 'application/json',
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
				encrypted_metadata: {
					id: fileId,
					originalName: file.name,
					mimeType: file.type,
					size: file.size,
					encryptedAt: new Date().toISOString(),
					version: 2 // Version 2 = multi-recipient encryption
				},
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
				formattedSize: formatFileSize(file.size),
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