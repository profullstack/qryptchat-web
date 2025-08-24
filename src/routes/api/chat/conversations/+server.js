import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Call the enhanced conversations function
		const { data, error } = await supabase.rpc('get_user_conversations_enhanced', {
			user_uuid: user.id
		});

		if (error) {
			console.error('Database error:', error);
			return json({ error: 'Failed to load conversations' }, { status: 500 });
		}

		return json({ conversations: data || [] });
	} catch (error) {
		console.error('API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const { type, name, participant_ids, group_id } = await event.request.json();
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get the actual user record from our users table
		const { data: dbUser, error: dbUserError } = await supabase
			.from('users')
			.select('id')
			.eq('id', user.id)
			.single();

		if (dbUserError || !dbUser) {
			console.error('User not found in users table:', dbUserError);
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Validate input
		if (!type || !['direct', 'group', 'room'].includes(type)) {
			return json({ error: 'Invalid conversation type' }, { status: 400 });
		}

		if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
			return json({ error: 'participant_ids is required and must be a non-empty array' }, { status: 400 });
		}

		// Validate that all participant IDs exist in users table
		const { data: validParticipants, error: participantCheckError } = await supabase
			.from('users')
			.select('id')
			.in('id', participant_ids);

		if (participantCheckError) {
			console.error('Error checking participants:', participantCheckError);
			return json({ error: 'Failed to validate participants' }, { status: 500 });
		}

		const validParticipantIds = validParticipants?.map(p => p.id) || [];
		const invalidParticipants = participant_ids.filter(id => !validParticipantIds.includes(id));
		
		if (invalidParticipants.length > 0) {
			return json({
				error: 'Some participants do not exist',
				invalid_participants: invalidParticipants
			}, { status: 400 });
		}

		// For direct messages, check if conversation already exists
		if (type === 'direct' && participant_ids.length === 1) {
			const other_user_id = participant_ids[0];
			
			// Check if conversation already exists between these users
			const { data: existingConversations } = await supabase
				.from('conversations')
				.select(`
					id,
					conversation_participants!inner(user_id)
				`)
				.eq('type', 'direct');

			// Check if any existing conversation includes both users
			if (existingConversations) {
				for (const conv of existingConversations) {
					const { data: participants } = await supabase
						.from('conversation_participants')
						.select('user_id')
						.eq('conversation_id', conv.id);
					
					const userIds = participants?.map(p => p.user_id) || [];
					if (userIds.includes(other_user_id) && userIds.includes(user.id) && userIds.length === 2) {
						return json({ 
							conversation_id: conv.id,
							message: 'Direct message conversation already exists'
						});
					}
				}
			}
		}

		// Create new conversation
		const conversationData = {
			type,
			created_by: user.id,
			...(name && { name }),
			...(group_id && { group_id })
		};

		const { data: newConversation, error: createError } = await supabase
			.from('conversations')
			.insert(conversationData)
			.select('id')
			.single();

		if (createError) {
			console.error('Create conversation error:', createError);
			return json({ error: 'Failed to create conversation' }, { status: 500 });
		}

		const conversationId = newConversation.id;

		// Add creator as participant
		const participants = [
			{
				conversation_id: conversationId,
				user_id: user.id,
				role: 'admin'
			}
		];

		// Add other participants
		for (const participantId of participant_ids) {
			if (participantId !== user.id) { // Don't add creator twice
				participants.push({
					conversation_id: conversationId,
					user_id: participantId,
					role: 'member'
				});
			}
		}

		const { error: participantsError } = await supabase
			.from('conversation_participants')
			.insert(participants);

		if (participantsError) {
			console.error('Add participants error:', participantsError);
			return json({ error: 'Failed to add participants' }, { status: 500 });
		}

		return json({ 
			conversation_id: conversationId,
			message: 'Conversation created successfully'
		});
	} catch (error) {
		console.error('API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}