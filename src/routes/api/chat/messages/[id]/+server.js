/**
 * @fileoverview API endpoint for fetching individual messages with encrypted content
 */

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * Authenticate user from request cookies
 * @param {Request} request - The request object
 * @returns {Promise<{user: Object, supabaseClient: Object} | null>}
 */
async function authenticateUser(request) {
	try {
		const supabaseClient = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		
		// Get session from cookies
		const cookies = request.headers.get('cookie') || '';
		const sessionCookie = cookies
			.split(';')
			.find(c => c.trim().startsWith('sb-access-token='));
		
		if (!sessionCookie) {
			return null;
		}
		
		const token = sessionCookie.split('=')[1];
		if (!token) {
			return null;
		}
		
		// Verify the JWT token
		const { data: { user }, error } = await supabaseClient.auth.getUser(token);
		
		if (error || !user) {
			console.error('Authentication failed:', error);
			return null;
		}
		
		return { user, supabaseClient };
	} catch (error) {
		console.error('Authentication error:', error);
		return null;
	}
}

/**
 * GET /api/chat/messages/[id]
 * Fetch a specific message with encrypted content for the authenticated user
 */
export async function GET({ params, request }) {
	try {
		const messageId = params.id;
		
		if (!messageId) {
			return json({ error: 'Message ID is required' }, { status: 400 });
		}
		
		// Authenticate user
		const auth = await authenticateUser(request);
		if (!auth) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}
		
		const { user, supabaseClient } = auth;
		
		// Fetch the message with user-specific encrypted content
		const { data: message, error: messageError } = await supabaseClient
			.from('messages')
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
				message_recipients!inner(encrypted_content)
			`)
			.eq('id', messageId)
			.eq('message_recipients.recipient_user_id', user.id)
			.single();
		
		if (messageError) {
			console.error('Error fetching message:', messageError);
			return json({ error: 'Message not found or access denied' }, { status: 404 });
		}
		
		if (!message || !message.message_recipients || message.message_recipients.length === 0) {
			return json({ error: 'Message not found or no encrypted content available' }, { status: 404 });
		}
		
		// Convert base64 back to JSON for client-side decryption
		const base64Content = message.message_recipients[0].encrypted_content;
		try {
			const decodedContent = Buffer.from(base64Content, 'base64').toString('utf8');
			message.encrypted_content = decodedContent;
		} catch (error) {
			console.error('Failed to decode base64 encrypted content:', error);
			message.encrypted_content = base64Content;
		}
		
		// Remove the message_recipients array as it's no longer needed
		delete message.message_recipients;
		
		return json(message);
		
	} catch (error) {
		console.error('Error in GET /api/chat/messages/[id]:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}