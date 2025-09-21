/**
 * Debug script to test archive function directly
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config();

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugArchiveFunction() {
	console.log('🔍 DEBUGGING ARCHIVE FUNCTION');
	
	// Test conversation from curl command
	const conversationId = 'aa43802a-5b3a-4d3c-9c16-e62259f63c40';
	const authUserId = '8f4b6316-4099-441b-ac11-67dc7dbdf256';
	
	console.log('Conversation:', conversationId);
	console.log('Auth User:', authUserId);

	// Check if this auth user exists in users table
	const { data: user, error: userError } = await supabase
		.from('users')
		.select('id, username, auth_user_id')
		.eq('auth_user_id', authUserId)
		.single();

	console.log('Internal user lookup:', user, 'error:', userError);

	if (!user) {
		console.log('❌ User not found in users table - this is the problem!');
		
		// Let's see all users with their auth_user_ids
		const { data: allUsers } = await supabase
			.from('users')
			.select('id, username, auth_user_id')
			.limit(10);
		
		console.log('All users in system:', allUsers);
		return;
	}

	// Check participants in this conversation
	const { data: participants, error: partError } = await supabase
		.from('conversation_participants')
		.select('user_id, role, left_at, archived_at, users(id, username)')
		.eq('conversation_id', conversationId);

	console.log('Participants:', participants, 'error:', partError);

	// Check if the internal user is a participant
	const isParticipant = participants?.find(p => p.user_id === user.id);
	console.log('Is user a participant?', isParticipant);

	// Test the archive function directly
	const { data: result, error } = await supabase.rpc('archive_conversation', {
		conversation_uuid: conversationId,
		user_uuid: authUserId
	});
	
	console.log('Archive function result:', result, 'error:', error);
	
	if (!result) {
		console.log('❌ Archive function returned FALSE - investigating why...');
		
		// Let's manually check what the function conditions are doing
		console.log('Manual check:');
		console.log('- conversation_id =', conversationId);
		console.log('- user_id =', user.id);
		console.log('- left_at =', isParticipant?.left_at);
		console.log('- archived_at =', isParticipant?.archived_at);
	}
}

debugArchiveFunction().catch(console.error);