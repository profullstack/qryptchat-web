import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const { id: conversationId } = event.params;
		const { user_ids } = await event.request.json();
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
			return json({ error: 'user_ids is required and must be a non-empty array' }, { status: 400 });
		}

		// Check if user is a participant in this conversation
		const { data: userParticipant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('role')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.eq('left_at', null)
			.single();

		if (participantError || !userParticipant) {
			return json({ error: 'You are not a participant in this conversation' }, { status: 403 });
		}

		// Get conversation details
		const { data: conversation, error: convError } = await supabase
			.from('conversations')
			.select('type, name')
			.eq('id', conversationId)
			.single();

		if (convError || !conversation) {
			return json({ error: 'Conversation not found' }, { status: 404 });
		}

		// If this is a direct message, convert it to a group conversation
		if (conversation.type === 'direct') {
			const { error: updateError } = await supabase
				.from('conversations')
				.update({ 
					type: 'group',
					name: conversation.name || 'Group Chat'
				})
				.eq('id', conversationId);

			if (updateError) {
				console.error('Update conversation error:', updateError);
				return json({ error: 'Failed to convert to group conversation' }, { status: 500 });
			}
		}

		// Check which users are already participants
		const { data: existingParticipants } = await supabase
			.from('conversation_participants')
			.select('user_id')
			.eq('conversation_id', conversationId)
			.is('left_at', null);

		const existingUserIds = existingParticipants?.map(p => p.user_id) || [];
		const newUserIds = user_ids.filter(id => !existingUserIds.includes(id));

		if (newUserIds.length === 0) {
			return json({ message: 'All users are already participants' });
		}

		// Add new participants
		const newParticipants = newUserIds.map(userId => ({
			conversation_id: conversationId,
			user_id: userId,
			role: 'member'
		}));

		const { error: addError } = await supabase
			.from('conversation_participants')
			.insert(newParticipants);

		if (addError) {
			console.error('Add participants error:', addError);
			return json({ error: 'Failed to add participants' }, { status: 500 });
		}

		// Create a system message about the new participants
		const { data: newUsers } = await supabase
			.from('users')
			.select('display_name, username')
			.in('id', newUserIds);

		const userNames = newUsers?.map(u => u.display_name || u.username).join(', ') || 'New users';
		const systemMessage = `${userNames} ${newUserIds.length === 1 ? 'was' : 'were'} added to the conversation`;

		const { error: messageError } = await supabase
			.from('messages')
			.insert({
				conversation_id: conversationId,
				sender_id: user.id,
				encrypted_content: systemMessage,
				message_type: 'system'
			});

		if (messageError) {
			console.error('System message error:', messageError);
			// Don't fail the request if system message fails
		}

		return json({ 
			message: `Successfully added ${newUserIds.length} participant(s)`,
			added_count: newUserIds.length
		});
	} catch (error) {
		console.error('API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const { id: conversationId } = event.params;
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check if user is a participant in this conversation
		const { data: userParticipant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('role')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.is('left_at', null)
			.single();

		if (participantError || !userParticipant) {
			return json({ error: 'You are not a participant in this conversation' }, { status: 403 });
		}

		// Get all participants
		const { data: participants, error } = await supabase
			.from('conversation_participants')
			.select(`
				user_id,
				role,
				joined_at,
				users (
					id,
					username,
					display_name,
					avatar_url
				)
			`)
			.eq('conversation_id', conversationId)
			.is('left_at', null)
			.order('joined_at', { ascending: true });

		if (error) {
			console.error('Database error:', error);
			return json({ error: 'Failed to load participants' }, { status: 500 });
		}

		return json({ participants: participants || [] });
	} catch (error) {
		console.error('API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}