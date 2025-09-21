import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ request, cookies, locals }) {
	try {
		// Get supabase client (will use cookies automatically)
		const supabase = createSupabaseClient();
		
		// Verify user is authenticated with better error handling
		const { data: { session } } = await supabase.auth.getSession();
		
		if (!session || !session.user) {
			console.error('Authentication failed - no valid session found');
			return json({ error: 'Unauthorized - No valid session', details: 'Please login again' }, { status: 401 });
		}
		
		const userId = session.user.id;
		console.log(`Authenticated user ${userId} requesting empty conversation cleanup`);
		
		// First, check if the stored procedure exists
		// If not, we'll use a more direct approach
		const { data: functionExists, error: functionCheckError } = await supabase
			.from('pg_catalog.pg_proc')
			.select('proname')
			.eq('proname', 'get_empty_conversations')
			.maybeSingle();
			
		let emptyConversationIds = [];
		
		if (functionCheckError || !functionExists) {
			// Fallback: Get conversations with no messages directly
			const { data: conversations, error: findError } = await supabase
				.from('conversations')
				.select('id, (SELECT count(*) FROM messages WHERE messages.conversation_id = conversations.id) as message_count');
				
			if (findError) {
				console.error('Error finding empty conversations:', findError);
				return json({ error: findError.message }, { status: 500 });
			}
			
			// Filter for empty conversations
			emptyConversationIds = conversations
				.filter((/** @type {any} */ conv) => conv.message_count === 0)
				.map((/** @type {any} */ conv) => conv.id);
		} else {
			// Use the stored procedure if it exists
			const { data: emptyConversations, error: findError } = await supabase.rpc(
				'get_empty_conversations'
			);
				
			if (findError) {
				console.error('Error finding empty conversations:', findError);
				return json({ error: findError.message }, { status: 500 });
			}
			
			emptyConversationIds = emptyConversations?.map((/** @type {any} */ conv) => conv.id) || [];
		}
		
		console.log(`Found ${emptyConversationIds.length} empty conversations`);
		
		// No empty conversations found
		if (emptyConversationIds.length === 0) {
			return json({ 
				message: 'No empty conversations found', 
				deletedCount: 0 
			});
		}
		
		// Delete the empty conversations
		const { data: deleteData, error: deleteError } = await supabase
			.from('conversations')
			.delete()
			.in('id', emptyConversationIds);
			
		if (deleteError) {
			console.error('Error deleting empty conversations:', deleteError);
			return json({ error: deleteError.message }, { status: 500 });
		}
		
		return json({
			message: 'Successfully deleted empty conversations',
			deletedCount: emptyConversationIds.length
		});
	} catch (error) {
		console.error('Unexpected error deleting empty conversations:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}