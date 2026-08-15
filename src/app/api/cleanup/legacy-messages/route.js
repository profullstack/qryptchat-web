import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';

const LEGACY_BATCH_LIMIT = 1000;

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
		console.log(`Authenticated user ${internalUserId} requesting legacy message cleanup (own messages only)`);

		// SECURITY FIX: Scope the query to messages the authenticated user sent.
		// Previously the query selected and deleted every matching message in the
		// table with no user filter at all, so any caller could wipe up to
		// LEGACY_BATCH_LIMIT legacy messages across every conversation on the
		// platform.
		const { data: messages, error: findError } = await serviceRoleClient
			.from('messages')
			.select('id')
			.eq('sender_id', internalUserId)
			.or('encrypted_content.ilike.%FALLBACK%,encrypted_content.ilike.%ML-KEM-768%')
			.limit(LEGACY_BATCH_LIMIT); // Process in batches for safety

		if (findError) {
			console.error('Error finding legacy messages:', findError);
			return NextResponse.json({ error: findError.message }, { status: 500 });
		}

		console.log(`Found ${messages?.length || 0} legacy encrypted messages for user ${internalUserId}`);

		// No legacy messages found
		if (!messages || messages.length === 0) {
			return NextResponse.json({
				message: 'No legacy messages found',
				deletedCount: 0
			});
		}

		const messageIds = messages.map((/** @type {any} */ msg) => msg.id);

		// Delete only the authenticated user's legacy messages.
		// The extra .eq('sender_id', internalUserId) is a defence-in-depth guard so
		// that an id list is never enough on its own to delete another user's row.
		const { error: deleteError } = await serviceRoleClient
			.from('messages')
			.delete()
			.in('id', messageIds)
			.eq('sender_id', internalUserId); // defence-in-depth ownership check

		if (deleteError) {
			console.error('Error deleting legacy messages:', deleteError);
			return NextResponse.json({ error: deleteError.message }, { status: 500 });
		}

		return NextResponse.json({
			message: 'Successfully deleted legacy messages',
			deletedCount: messageIds.length
		});
	} catch (error) {
		console.error('Unexpected error deleting legacy messages:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
