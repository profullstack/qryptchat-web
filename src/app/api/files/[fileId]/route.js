// API endpoint for encrypted file downloads
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { postQuantumEncryption } from '@/lib/crypto/post-quantum-encryption.js';

async function resolveRouteParams(params) {
	return (await params) || {};
}

export async function GET(request, { params } = {}) {
	try {
		// Create Supabase server client
		const supabase = await createSupabaseServerClient();
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { fileId } = await resolveRouteParams(params);
		console.log(`📁 [FILE-DOWNLOAD] Download request from auth user: ${user.id} for file: ${fileId}`);

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error( '📁 [FILE-DOWNLOAD] Internal user not found:', userError);
			return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
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
			console.error( '📁 [FILE-DOWNLOAD] File not found or unauthorized:', fileError);
			return NextResponse.json({ error: 'File not found or unauthorized' }, { status: 404 });
		}

		console.log(`📁 [FILE-DOWNLOAD] Processing encrypted file: ${fileId}`);

		// Download encrypted file from storage
		const { data: storageData, error: storageError } = await supabase.storage
			.from('encrypted-files')
			.download(fileData.storage_path);

		if (storageError || !storageData) {
			console.error( '📁 [FILE-DOWNLOAD] Storage download failed:', storageError);
			return NextResponse.json({ error: 'Failed to download file from storage' }, { status: 500 });
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
			console.error( `📁 [FILE-DOWNLOAD] No encrypted copy found for user ${userId} or ${user.id}`);
			return NextResponse.json({ error: 'No encrypted file copy found for user' }, { status: 404 });
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
		const fileMetadata = JSON.parse(decryptedContent);
		const actualFileContent = fileMetadata.content;
		const displayFilename = fileMetadata.filename || 'encrypted-file';
		
		// Decrypt the encrypted_metadata to get mimeType
		let mimeType = 'application/octet-stream';
		try {
			const userEncryptedMetadata = fileData.encrypted_metadata?.[userId] || fileData.encrypted_metadata?.[user.id];
			if (userEncryptedMetadata) {
				const decryptedMetadata = await postQuantumEncryption.decryptFromSender(userEncryptedMetadata, '');
				const metadataObj = JSON.parse(decryptedMetadata);
				mimeType = metadataObj.mimeType || 'application/octet-stream';
			}
		} catch {
			console.warn('📁 [FILE-DOWNLOAD] Could not decrypt metadata for mimeType');
		}

		// Convert base64 back to binary
		const fileBuffer = Buffer.from(actualFileContent, 'base64');

		console.log(`📁 [FILE-DOWNLOAD] ✅ File decrypted successfully: ${displayFilename}`);

		// Return decrypted file with correct content length
		return new Response(fileBuffer, {
			status: 200,
			headers: {
				'Content-Type': mimeType,
				'Content-Length': fileBuffer.length.toString(),
				'Content-Disposition': `attachment; filename="${encodeURIComponent(displayFilename)}"`,
				'Cache-Control': 'private, no-cache, no-store, must-revalidate',
				'Pragma': 'no-cache',
				'Expires': '0'
			}
		});

	} catch (err) {
		console.error( '📁 [FILE-DOWNLOAD] ❌ Unexpected error:', err);
		return NextResponse.json({ error: 'Internal server error during file download' }, { status: 500 });
	}
}

// Get file info without downloading the actual file content
export async function HEAD(request, { params } = {}) {
	try {
		// Create Supabase server client
		const supabase = await createSupabaseServerClient();
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const userId = user.id;
		const { fileId } = await resolveRouteParams(params);

		// Get file metadata from database
		const { data: fileData, error: fileError } = await supabase
			.from('encrypted_files')
			.select(`
				id,
				encrypted_metadata,
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
			return NextResponse.json({ error: 'File not found or unauthorized' }, { status: 404 });
		}

		// Return file headers without content
		// Metadata is encrypted - client will decrypt
		return new Response(null, {
			status: 200,
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="encrypted-file"`,
				'Last-Modified': new Date(fileData.created_at).toUTCString()
			}
		});

	} catch (err) {
		console.error( '📁 [FILE-INFO] ❌ Unexpected error:', err);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

// Get file metadata as JSON
export async function POST(request, { params } = {}) {
	try {
		// Create Supabase server client
		const supabase = await createSupabaseServerClient();
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const userId = user.id;
		const { fileId } = await resolveRouteParams(params);

		console.log(`📁 [FILE-INFO] Info request from user: ${userId} for file: ${fileId}`);

		// Get file metadata from database
		const { data: fileData, error: fileError } = await supabase
			.from('encrypted_files')
			.select(`
				id,
				message_id,
				encrypted_metadata,
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
			console.error( '📁 [FILE-INFO] File not found or unauthorized:', fileError);
			return NextResponse.json({ error: 'File not found or unauthorized' }, { status: 404 });
		}

		// Return file metadata - all sensitive data is E2E encrypted
		return NextResponse.json({
			id: fileData.id,
			messageId: fileData.message_id,
			conversationId: fileData.messages[0].conversation_id,
			encryptedMetadata: fileData.encrypted_metadata, // Client will decrypt
			createdAt: fileData.created_at,
			createdBy: fileData.created_by,
			isOwner: fileData.created_by === userId
		});

	} catch (err) {
		console.error( '📁 [FILE-INFO] ❌ Unexpected error:', err);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

