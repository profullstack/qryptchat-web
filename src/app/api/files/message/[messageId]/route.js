// API endpoint to get files for a specific message
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';

export async function GET(request, { params } = {}) {
	try {
		const { messageId } = (await params) || {};
		if (!messageId) {
			return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
		}

		// Create Supabase server client
		const supabase = await createSupabaseServerClient();
		
		// Check authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		console.log(`📁 [FILES-BY-MESSAGE] Request from auth user: ${user.id} for message: ${messageId}`);

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (userError || !internalUser) {
			console.error( '📁 [FILES-BY-MESSAGE] Internal user not found:', userError);
			return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
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
				encrypted_metadata,
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
			console.error( '📁 [FILES-BY-MESSAGE] Database error:', filesError);
			return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
		}

		if (!files || files.length === 0) {
			console.log(`📁 [FILES-BY-MESSAGE] No files found for message: ${messageId}`);
			return NextResponse.json({ files: [] });
		}

		console.log(`📁 [FILES-BY-MESSAGE] Found ${files.length} files for message: ${messageId}`);

		// Format file data for frontend
		// All metadata is E2E encrypted - client will decrypt it
		const formattedFiles = files.map(file => ({
			id: file.id,
			messageId: file.message_id,
			encryptedMetadata: file.encrypted_metadata, // Client will decrypt this
			createdAt: file.created_at,
			createdBy: file.created_by,
			isOwner: file.created_by === userId
		}));

		return NextResponse.json({ files: formattedFiles });

	} catch (err) {
		console.error( '📁 [FILES-BY-MESSAGE] ❌ Unexpected error:', err);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

