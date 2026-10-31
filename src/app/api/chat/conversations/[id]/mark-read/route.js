import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';

function normalizeConversationId(conversationId) {
	return typeof conversationId === 'string' ? conversationId.trim() : '';
}

/**
 * Mark all messages in a conversation as read for the current user
 * @type {import('./$types').RequestHandler}
 */
export async function POST(request, { params } = {}) {
	try {
		const { id: conversationId } = (await params) || {};
		const normalizedConversationId = normalizeConversationId(conversationId);

		if (!normalizedConversationId) {
			return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
		}

		const supabase = await createSupabaseServerClient();
		
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

		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', normalizedConversationId)
			.eq('user_id', internalUser.id)
			.maybeSingle();

		if (participantError || !participant) {
			return NextResponse.json({ error: 'Access denied to conversation' }, { status: 403 });
		}

		// PostgREST `.in()` accepts an array, not a nested query builder. Page the
		// conversation's IDs and update deliveries in bounded batches.
		const batchSize = 500;
		let offset = 0;
		while (true) {
			const { data: messageRows, error: messagesError } = await supabase
				.from('messages')
				.select('id')
				.eq('conversation_id', normalizedConversationId)
				.order('id')
				.range(offset, offset + batchSize - 1);

			if (messagesError) {
				console.error('Error loading conversation messages to mark read:', messagesError);
				return NextResponse.json({ error: 'Failed to mark messages as read' }, { status: 500 });
			}

			const messageIds = (messageRows || []).map(({ id }) => id).filter(Boolean);
			if (!messageIds.length) break;

			const { error: updateError } = await supabase
				.from('deliveries')
				.update({ read_ts: new Date().toISOString() })
				.eq('recipient_user_id', internalUser.id)
				.is('read_ts', null)
				.is('deleted_ts', null)
				.in('message_id', messageIds);

			if (updateError) {
				console.error('Error marking messages as read:', updateError);
				return NextResponse.json({ error: 'Failed to mark messages as read' }, { status: 500 });
			}

			if (messageIds.length < batchSize) break;
			offset += batchSize;
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
