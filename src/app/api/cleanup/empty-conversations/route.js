import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';

export async function DELETE(request) {
	try {
		// Use createSupabaseServerClient (reads cookies server-side) and validate
		// with getUser() rather than getSession() to ensure the JWT is re-verified
		// against the Supabase Auth server and cannot be spoofed via cookie tampering.
		const supabase = await createSupabaseServerClient();
		const { data: { user }, error: authError } = await supabase.auth.getUser();

		if (!user || authError) {
			console.error('Authentication failed - no valid user found');
			return NextResponse.json({ error: 'Unauthorized - No valid session', details: 'Please login again' }, { status: 401 });
		}

		// Resolve the internal user ID from the Supabase Auth UUID.
		const serviceRoleClient = createServiceRoleClient();
		const { data: internalUser, error: internalUserError } = await serviceRoleClient
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (internalUserError || !internalUser) {
			console.error('User record not found for auth_user_id:', user.id);
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}

		const internalUserId = internalUser.id;
		console.log(`Authenticated user ${internalUserId} requesting empty conversation cleanup (own conversations only)`);

		// SECURITY FIX: Only ever consider conversations the caller participates in.
		// Previously this route enumerated every conversation in the table (via a
		// bogus pg_catalog probe and an unscoped fallback) and deleted all empty
		// ones platform-wide.
		const { data: participantRows, error: participantError } = await serviceRoleClient
			.from('conversation_participants')
			.select('conversation_id')
			.eq('user_id', internalUserId);

		if (participantError) {
			console.error('Error finding user conversations:', participantError);
			return NextResponse.json({ error: participantError.message }, { status: 500 });
		}

		const conversationIds = [...new Set(
			(participantRows || []).map((/** @type {any} */ row) => row.conversation_id)
		)];

		if (conversationIds.length === 0) {
			return NextResponse.json({
				message: 'No empty conversations found',
				deletedCount: 0
			});
		}

		// Find which of those conversations still hold at least one message.
		const { data: messageRows, error: messageError } = await serviceRoleClient
			.from('messages')
			.select('conversation_id')
			.in('conversation_id', conversationIds);

		if (messageError) {
			console.error('Error finding empty conversations:', messageError);
			return NextResponse.json({ error: messageError.message }, { status: 500 });
		}

		const nonEmpty = new Set(
			(messageRows || []).map((/** @type {any} */ row) => row.conversation_id)
		);
		const emptyConversationIds = conversationIds.filter((id) => !nonEmpty.has(id));

		console.log(`Found ${emptyConversationIds.length} empty conversations for user ${internalUserId}`);

		// No empty conversations found
		if (emptyConversationIds.length === 0) {
			return NextResponse.json({
				message: 'No empty conversations found',
				deletedCount: 0
			});
		}

		// Delete only the empty conversations the caller belongs to.
		const { error: deleteError } = await serviceRoleClient
			.from('conversations')
			.delete()
			.in('id', emptyConversationIds);

		if (deleteError) {
			console.error('Error deleting empty conversations:', deleteError);
			return NextResponse.json({ error: deleteError.message }, { status: 500 });
		}

		return NextResponse.json({
			message: 'Successfully deleted empty conversations',
			deletedCount: emptyConversationIds.length
		});
	} catch (error) {
		console.error('Unexpected error deleting empty conversations:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
