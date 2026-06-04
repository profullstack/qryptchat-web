import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';

/**
 * Mark all messages in a conversation as read for the current user
 * @type {import('./$types').RequestHandler}
 */
export async function POST(request, { params } = {}) {
	try {
		const supabase = await createSupabaseServerClient();
		const conversationId = params.id;
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get internal user ID
		const { data: internalUser } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (!internalUser) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}

		// Mark all unread messages in this conversation as read
		const { error: updateError } = await supabase
			.from('deliveries')
			.update({ read_ts: new Date().toISOString() })
			.eq('recipient_user_id', internalUser.id)
			.is('read_ts', null)
			.is('deleted_ts', null)
			.in('message_id',
				supabase
					.from('messages')
					.select('id')
					.eq('conversation_id', conversationId)
			);

		if (updateError) {
			console.error('Error marking messages as read:', updateError);
			return NextResponse.json({ error: 'Failed to mark messages as read' }, { status: 500 });
		}

		return NextResponse.json({ 
			success: true,
			message: 'Messages marked as read'
		});
	} catch (error) {
		console.error('API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}