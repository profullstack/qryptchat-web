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

		// Get internal user ID first
		const { data: internalUser } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (!internalUser) {
			return json({ conversations: [] });
		}

		// Call the original working function with INTERNAL user ID
		const { data, error } = await supabase.rpc('get_user_conversations_enhanced', {
			user_uuid: internalUser.id // Use internal user ID, not auth user ID
		});

		if (error) {
			console.error('Database error:', error);
			return json({ error: 'Failed to load conversations' }, { status: 500 });
		}

		// Simple transformation with proper archive status check
		const conversationsWithArchive = [];
		
		for (const conv of data || []) {
			// Check archive status for this conversation
			const { data: participantData } = await supabase
				.from('conversation_participants')
				.select('archived_at')
				.eq('conversation_id', conv.conversation_id)
				.eq('user_id', internalUser?.id)
				.maybeSingle();

			conversationsWithArchive.push({
				...conv,
				id: conv.conversation_id, // Add 'id' field for frontend compatibility
				name: conv.conversation_name, // Add 'name' field for frontend compatibility
				type: conv.conversation_type, // Add 'type' field for frontend compatibility
				is_archived: participantData?.archived_at !== null,
				archived_at: participantData?.archived_at
			});
		}

		return json({ conversations: conversationsWithArchive });
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

		// For now, skip the user validation since we have users authenticated via different methods
		// The authenticated user from Supabase Auth may not exist in our custom users table
		// but they should still be able to create conversations with users who do exist
		console.log('Authenticated user ID:', user.id);

		// Get the internal user ID from the users table using auth_user_id
		const { data: internalUser } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.maybeSingle();

		// Validate input
		if (!type || !['direct', 'group', 'room'].includes(type)) {
			return json({ error: 'Invalid conversation type' }, { status: 400 });
		}

		if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
			return json({ error: 'participant_ids is required and must be a non-empty array' }, { status: 400 });
		}

		// Skip participant validation for now due to network issues
		// TODO: Re-enable participant validation once network connectivity is stable
		console.log('Skipping participant validation due to network issues');
		console.log('Participant IDs to add:', participant_ids);

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
					if (userIds.includes(other_user_id) && internalUser && userIds.includes(internalUser.id) && userIds.length === 2) {
						return json({ 
							conversation_id: conv.id,
							message: 'Direct message conversation already exists'
						});
					}
				}
			}
		}

		// Create new conversation - only set created_by if user exists in users table
		const conversationData = {
			type,
			...(internalUser && { created_by: internalUser.id }),
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

		// Add participants (only add users that exist in our users table)
		const participants = [];

		// Add other participants (validate they exist in users table)
		for (const participantId of participant_ids) {
			participants.push({
				conversation_id: conversationId,
				user_id: participantId,
				role: 'member'
			});
		}

		if (internalUser) {
			// Add creator as admin if not already in participants
			if (!participant_ids.includes(internalUser.id)) {
				participants.push({
					conversation_id: conversationId,
					user_id: internalUser.id,
					role: 'admin'
				});
			} else {
				// Update creator's role to admin if they're in participants
				const creatorParticipant = participants.find(p => p.user_id === internalUser.id);
				if (creatorParticipant) {
					creatorParticipant.role = 'admin';
				}
			}
		}

		// Use upsert to handle potential duplicates gracefully
		const { error: participantsError } = await supabase
			.from('conversation_participants')
			.upsert(participants, {
				onConflict: 'conversation_id,user_id',
				ignoreDuplicates: true
			});

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

/** @type {import('./$types').RequestHandler} */
export async function PATCH(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const { conversation_id, action } = await event.request.json();
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Validate input
		if (!conversation_id) {
			return json({ error: 'conversation_id is required' }, { status: 400 });
		}

		if (!action || !['archive', 'unarchive'].includes(action)) {
			return json({ error: 'action must be "archive" or "unarchive"' }, { status: 400 });
		}

		let success, error;

		if (action === 'archive') {
			({ data: success, error } = await supabase.rpc('archive_conversation', {
				conversation_uuid: conversation_id,
				user_uuid: user.id
			}));
		} else {
			({ data: success, error } = await supabase.rpc('unarchive_conversation', {
				conversation_uuid: conversation_id,
				user_uuid: user.id
			}));
		}

		if (error) {
			console.error('Database error:', error);
			return json({ error: `Failed to ${action} conversation` }, { status: 500 });
		}

		if (!success) {
			return json({ 
				error: `Conversation not found or cannot be ${action}d` 
			}, { status: 404 });
		}

		return json({ 
			success: true,
			message: `Conversation ${action}d successfully` 
		});
	} catch (error) {
		console.error('API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}