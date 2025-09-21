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
		console.log(`Authenticated user ${userId} requesting legacy message cleanup`);
		
		// Find messages with legacy encryption (not ML-KEM-1024)
		// This includes any messages with "FALLBACK" in the encryption algorithm
		// or any message with "ML-KEM-768" algorithm
		const { data: messages, error: findError } = await supabase
			.from('messages')
			.select('id, encrypted_content')
			.or('encrypted_content.ilike.%FALLBACK%,encrypted_content.ilike.%ML-KEM-768%')
			.limit(1000); // Process in batches for safety
			
		if (findError) {
			console.error('Error finding legacy messages:', findError);
			return json({ error: findError.message }, { status: 500 });
		}
		
		console.log(`Found ${messages?.length || 0} legacy encrypted messages`);
		
		// No legacy messages found
		if (!messages || messages.length === 0) {
			return json({ 
				message: 'No legacy messages found', 
				deletedCount: 0 
			});
		}
		
		// Get message IDs to delete
		const messageIds = messages.map((/** @type {any} */ msg) => msg.id);
		
		// Delete the legacy messages
		const { data: deleteData, error: deleteError } = await supabase
			.from('messages')
			.delete()
			.in('id', messageIds);
			
		if (deleteError) {
			console.error('Error deleting legacy messages:', deleteError);
			return json({ error: deleteError.message }, { status: 500 });
		}
		
		return json({
			message: 'Successfully deleted legacy messages',
			deletedCount: messageIds.length
		});
	} catch (error) {
		console.error('Unexpected error deleting legacy messages:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}