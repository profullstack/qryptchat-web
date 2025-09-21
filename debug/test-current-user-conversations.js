/**
 * Test what conversations the current authenticated user sees
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCurrentUserConversations() {
	// Test with the auth user from the curl command
	const authUserId = '8f4b6316-4099-441b-ac11-67dc7dbdf256';
	
	console.log('🔍 Testing current user conversations');
	console.log('Auth User ID:', authUserId);
	
	// Get internal user
	const { data: user } = await supabase
		.from('users')
		.select('id, username')
		.eq('auth_user_id', authUserId)
		.single();
	
	console.log('Internal User:', user);
	
	// Test the get_user_conversations_enhanced function with AUTH user ID
	const { data: conversations1, error: error1 } = await supabase.rpc('get_user_conversations_enhanced', {
		user_uuid: authUserId
	});
	
	console.log('Function with AUTH user ID:', conversations1?.length || 0, 'error:', error1);

	// Test the get_user_conversations_enhanced function with INTERNAL user ID
	const { data: conversations2, error: error2 } = await supabase.rpc('get_user_conversations_enhanced', {
		user_uuid: user.id
	});
	
	console.log('Function with INTERNAL user ID:', conversations2?.length || 0, 'error:', error2);
	
	// Check what participants exist for this user
	const { data: participations } = await supabase
		.from('conversation_participants')
		.select('conversation_id, left_at, archived_at, conversations(type, name)')
		.eq('user_id', user.id);
	
	console.log(`\nDirect participant check for user ${user.username}:`);
	console.log('Participations:', participations?.length || 0);
	
	if (participations) {
		for (const part of participations) {
			console.log(`- Conv ${part.conversation_id}: ${part.conversations?.name || 'Unnamed'} (${part.conversations?.type}) - Left: ${part.left_at ? 'YES' : 'NO'} - Archived: ${part.archived_at ? 'YES' : 'NO'}`);
		}
	}
}

testCurrentUserConversations().catch(console.error);