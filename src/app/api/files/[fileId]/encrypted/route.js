// API endpoint to get encrypted file data for client-side decryption
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';

export async function GET(request, { params } = {}) {
	try {
		// Create Supabase server client
		const supabase = createSupabaseServerClient();
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const fileId = params.fileId;
		console.log(`📁 [ENCRYPTED-FILE] Request from auth user: ${user.id} for file: ${fileId}`);

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error( '📁 [ENCRYPTED-FILE] Internal user not found:', userError);
			return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
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
			console.error( '📁 [ENCRYPTED-FILE] File not found or unauthorized:', fileError);
			return NextResponse.json({ error: 'File not found or unauthorized' }, { status: 404 });
		}

		console.log(`📁 [ENCRYPTED-FILE] Found encrypted file: ${fileId}`);

		// Download encrypted file from storage
		const { data: storageData, error: storageError } = await supabase.storage
			.from('encrypted-files')
			.download(fileData.storage_path);

		if (storageError || !storageData) {
			console.error( '📁 [ENCRYPTED-FILE] Storage download failed:', storageError);
			return NextResponse.json({ error: 'Failed to download file from storage' }, { status: 500 });
		}

		// Get the encrypted contents as text
		const encryptedContentsJson = await storageData.text();

		console.log(`📁 [ENCRYPTED-FILE] ✅ Retrieved encrypted file data: ${fileId}`);

		// Return encrypted file data for client-side decryption
		// All metadata is E2E encrypted - client will decrypt it
		return NextResponse.json({
			success: true,
			file: {
				id: fileData.id,
				messageId: fileData.message_id,
				encryptedContents: encryptedContentsJson,
				encryptedMetadata: fileData.encrypted_metadata // E2E encrypted metadata
			}
		});

	} catch (err) {
		console.error( '📁 [ENCRYPTED-FILE] ❌ Unexpected error:', err);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}