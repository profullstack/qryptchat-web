// Messages API endpoint with disappearing messages support
// Handles message creation with automatic delivery fan-out
// Now supports per-participant encryption

import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Lazy service role client creation
let supabaseServiceRole = null;
function getServiceRoleClient() {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createServiceRoleClient();
	}
	return supabaseServiceRole;
}

// Create regular Supabase client for authentication
const supabaseClient = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

/**
 * Authenticate user from request cookies
 * @param {Request} request - The request object
 * @returns {Promise<{user: Object|null, error: string|null}>}
 */
async function authenticateUser(request) {
	try {
		// Parse cookies to get JWT token
		const cookieHeader = request.headers.get('cookie');
		if (!cookieHeader) {
			console.log('🔐 [API] ❌ No cookies found in request');
			return { user: null, error: 'No authentication cookies found' };
		}

		// Extract access token from cookies
		const cookies = Object.fromEntries(
			cookieHeader.split('; ').map(cookie => {
				const [name, ...rest] = cookie.split('=');
				return [name, rest.join('=')];
			})
		);

		const accessToken = cookies['sb-access-token'] || cookies['sb-refresh-token'];
		if (!accessToken) {
			console.log('🔐 [API] ❌ No Supabase auth tokens found in cookies');
			return { user: null, error: 'No authentication tokens found' };
		}

		console.log('🔐 [API] 🔍 Found auth token, verifying with Supabase...');

		// Verify the JWT token with regular Supabase client (not service role)
		const { data: { user }, error } = await supabaseClient.auth.getUser(accessToken);

		if (error) {
			console.log('🔐 [API] ❌ Token verification failed:', error.message);
			return { user: null, error: `Authentication failed: ${error.message}` };
		}

		if (!user) {
			console.log('🔐 [API] ❌ No user returned from token verification');
			return { user: null, error: 'Invalid authentication token' };
		}

		console.log('🔐 [API] ✅ User authenticated successfully:', user.id);
		return { user, error: null };

	} catch (error) {
		console.error('🔐 [API] ❌ Authentication error:', error);
		return { user: null, error: 'Authentication system error' };
	}
}

/**
 * POST /api/chat/messages
 * Create a new message and fan out deliveries to recipients
 */
export async function POST({ request }) {
  try {
    console.log('🔐 [API] POST /api/chat/messages - Starting authentication');

    // Authenticate user
    const { user, error: authError } = await authenticateUser(request);
    if (authError || !user) {
      console.log('🔐 [API] ❌ Authentication failed:', authError);
      return json({ error: authError || 'Authentication failed' }, { status: 401 });
    }

    console.log('🔐 [API] ✅ User authenticated:', user.id);

    // Get internal user ID from auth_user_id
    const { data: userData, error: userError } = await getServiceRoleClient()
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (userError || !userData) {
      console.log('🔐 [API] ❌ Failed to get internal user ID:', userError?.message);
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userId = userData.id;
    console.log('🔐 [API] ✅ Internal user ID:', userId);

    const { conversation_id, encrypted_contents, content_type = 'text', has_attachments = false, reply_to_id } = await request.json();

    // Validate required fields
    if (!conversation_id || !encrypted_contents) {
      return json({ error: 'Missing required fields: conversation_id, encrypted_contents' }, { status: 400 });
    }

    // Validate encrypted_contents is an object with user_id -> encrypted_content mappings
    if (typeof encrypted_contents !== 'object' || Object.keys(encrypted_contents).length === 0) {
      return json({ error: 'encrypted_contents must be an object with user_id -> encrypted_content mappings' }, { status: 400 });
    }

    // Verify user is a participant in the conversation
    const { data: participant, error: participantError } = await getServiceRoleClient()
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversation_id)
      .eq('user_id', userId)
      .is('left_at', null)
      .single();

    if (participantError || !participant) {
      console.log('🔐 [API] ❌ User not authorized for conversation:', participantError?.message);
      return json({ error: 'Not authorized to send messages in this conversation' }, { status: 403 });
    }

    console.log('🔐 [API] ✅ User is participant in conversation');

    // Create the message (without encrypted_content in main table)
    const { data: message, error: messageError } = await getServiceRoleClient()
      .from('messages')
      .insert([{
        conversation_id,
        sender_id: userId,
        encrypted_content: Buffer.from(''), // Empty buffer - actual content stored in message_recipients
        content_type,
        has_attachments,
        reply_to_id: reply_to_id || null
      }])
      .select('id, conversation_id, sender_id, content_type, has_attachments, created_at, reply_to_id')
      .single();

    if (messageError) {
      console.error('Error creating message:', messageError);
      return json({ error: 'Failed to create message' }, { status: 500 });
    }

    // Create per-participant encrypted message copies
    try {
      // Convert JSON encrypted content to base64 for database storage
      // The post-quantum encryption returns JSON strings, but the database function expects base64
      const base64EncryptedContents = {};
      for (const [userId, jsonEncryptedContent] of Object.entries(encrypted_contents)) {
        console.log('🔐 [API SEND] Converting JSON to base64 for storage:', {
          userId,
          jsonType: typeof jsonEncryptedContent,
          jsonLength: jsonEncryptedContent?.length || 0,
          jsonPreview: jsonEncryptedContent?.substring(0, 100) || 'N/A',
          isValidJSON: (() => {
            try {
              JSON.parse(jsonEncryptedContent);
              return true;
            } catch {
              return false;
            }
          })()
        });
        
        // Convert JSON string to base64
        const base64Content = Buffer.from(jsonEncryptedContent, 'utf8').toString('base64');
        console.log('🔐 [API SEND] Converted to base64:', {
          userId,
          base64Length: base64Content?.length || 0,
          base64Preview: base64Content?.substring(0, 100) || 'N/A',
          isValidBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(base64Content || '')
        });
        
        base64EncryptedContents[userId] = base64Content;
      }

      console.log('🔐 [API] Creating message recipients for message:', message.id);
      console.log('🔐 [API] Base64 encrypted contents keys:', Object.keys(base64EncryptedContents));

      const { error: recipientsError } = await getServiceRoleClient()
        .rpc('fn_create_message_recipients', {
          p_message_id: message.id,
          p_encrypted_contents: base64EncryptedContents
        });

      if (recipientsError) {
        console.error('🔐 [API] ❌ Error creating message recipients:', recipientsError);
        console.error('🔐 [API] ❌ Error details:', JSON.stringify(recipientsError, null, 2));
        // Clean up the message if recipients creation failed
        await getServiceRoleClient()
          .from('messages')
          .delete()
          .eq('id', message.id);
        return json({ error: 'Failed to create encrypted message copies' }, { status: 500 });
      }

      console.log('🔐 [API] ✅ Successfully created message recipients');
    } catch (error) {
      console.error('🔐 [API] ❌ Exception in message recipients creation:', error);
      console.error('🔐 [API] ❌ Exception stack:', error instanceof Error ? error.stack : 'No stack trace');
      // Clean up the message if recipients creation failed
      await getServiceRoleClient()
        .from('messages')
        .delete()
        .eq('id', message.id);
      return json({ error: 'Failed to create encrypted message copies' }, { status: 500 });
    }

    // Fan out deliveries to all recipients (excluding sender)
    const { error: deliveryError } = await getServiceRoleClient()
      .rpc('fn_create_deliveries_for_message', { p_message_id: message.id });

    if (deliveryError) {
      console.error('Error creating deliveries:', deliveryError);
      // Message was created but deliveries failed - this is a partial failure
      // We could delete the message here, but it's better to log and continue
      // The message exists but won't have proper delivery tracking
    }

    return json({
      success: true,
      message: {
        id: message.id,
        conversation_id: message.conversation_id,
        sender_id: message.sender_id,
        content_type: message.content_type,
        has_attachments: message.has_attachments,
        created_at: message.created_at,
        reply_to_id: message.reply_to_id
      }
    });

  } catch (error) {
    console.error('Error in POST /api/chat/messages:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/chat/messages?conversation_id=xxx
 * Get messages for a conversation (filtered by user's active deliveries)
 */
export async function GET({ url, request }) {
  try {
    console.log('🔐 [API] GET /api/chat/messages - Starting authentication');

    // Authenticate user
    const { user, error: authError } = await authenticateUser(request);
    if (authError || !user) {
      console.log('🔐 [API] ❌ Authentication failed:', authError);
      return json({ error: authError || 'Authentication failed' }, { status: 401 });
    }

    console.log('🔐 [API] ✅ User authenticated:', user.id);

    // Get internal user ID from auth_user_id
    const { data: userData, error: userError } = await getServiceRoleClient()
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (userError || !userData) {
      console.log('🔐 [API] ❌ Failed to get internal user ID:', userError?.message);
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userId = userData.id;
    console.log('🔐 [API] ✅ Internal user ID:', userId);

    const conversationId = url.searchParams.get('conversation_id');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    if (!conversationId) {
      return json({ error: 'Missing conversation_id parameter' }, { status: 400 });
    }

    // Verify user is a participant in the conversation
    const { data: participant, error: participantError } = await getServiceRoleClient()
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .is('left_at', null)
      .single();

    if (participantError || !participant) {
      console.log('🔐 [API] ❌ User not authorized for conversation:', participantError?.message);
      return json({ error: 'Not authorized to view messages in this conversation' }, { status: 403 });
    }

    console.log('🔐 [API] ✅ User is participant in conversation');

    // Get messages that haven't expired for this user
    // Join with deliveries and message_recipients to get user-specific encrypted content
    const { data: messages, error: messagesError } = await getServiceRoleClient()
      .from('messages')
      .select(`
        id,
        conversation_id,
        sender_id,
        content_type,
        has_attachments,
        created_at,
        reply_to_id,
        deliveries!inner(
          delivered_ts,
          read_ts,
          expires_at,
          deleted_ts
        ),
        message_recipients!inner(
          encrypted_content,
          expires_at,
          start_on,
          read_at
        )
      `)
      .eq('conversation_id', conversationId)
      .eq('deliveries.recipient_user_id', userId)
      .eq('message_recipients.recipient_user_id', userId)
      .is('deliveries.deleted_ts', null)
      // Filter out expired messages for this specific user
      .or('message_recipients.expires_at.is.null,message_recipients.expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    // Transform messages for client consumption
    const transformedMessages = messages?.map(message => {
      // The encrypted_content from database is already base64, convert back to JSON string
      let encryptedContent = null;
      if (message.message_recipients[0]?.encrypted_content) {
        try {
          // Convert base64 back to JSON string (reverse of what we did in POST)
          encryptedContent = Buffer.from(message.message_recipients[0].encrypted_content, 'base64').toString('utf8');
          console.log('🔐 [API GET] Converted base64 to JSON:', {
            messageId: message.id,
            base64Length: message.message_recipients[0].encrypted_content.length,
            jsonLength: encryptedContent.length,
            jsonPreview: encryptedContent.substring(0, 100),
            isValidJSON: (() => {
              try {
                JSON.parse(encryptedContent);
                return true;
              } catch {
                return false;
              }
            })()
          });
        } catch (error) {
          console.error('🔐 [API GET] ❌ Failed to convert base64 to JSON:', error);
          encryptedContent = null;
        }
      }

      return {
        id: message.id,
        conversation_id: message.conversation_id,
        sender_id: message.sender_id,
        encrypted_content: encryptedContent,
        content_type: message.content_type,
        has_attachments: message.has_attachments,
        created_at: message.created_at,
        reply_to_id: message.reply_to_id,
        delivery_info: {
          delivered_ts: message.deliveries[0]?.delivered_ts,
          read_ts: message.deliveries[0]?.read_ts,
          expires_at: message.deliveries[0]?.expires_at
        },
        disappearing_info: {
          expires_at: message.message_recipients[0]?.expires_at,
          start_on: message.message_recipients[0]?.start_on,
          read_at: message.message_recipients[0]?.read_at
        }
      };
    }) || [];

    return json({
      success: true,
      messages: transformedMessages,
      pagination: {
        limit,
        offset,
        count: transformedMessages.length
      }
    });

  } catch (error) {
    console.error('Error in GET /api/chat/messages:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/chat/messages/:id/read
 * Mark a message as read (starts read-based timer if configured)
 */
export async function PATCH({ request, params }) {
  try {
    console.log('🔐 [API] PATCH /api/chat/messages/:id/read - Starting authentication');

    // Authenticate user
    const { user, error: authError } = await authenticateUser(request);
    if (authError || !user) {
      console.log('🔐 [API] ❌ Authentication failed:', authError);
      return json({ error: authError || 'Authentication failed' }, { status: 401 });
    }

    console.log('🔐 [API] ✅ User authenticated:', user.id);

    const messageId = params.id;
    if (!messageId) {
      return json({ error: 'Missing message ID' }, { status: 400 });
    }

    // Get internal user ID from auth_user_id
    const { data: userData, error: userError } = await getServiceRoleClient()
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (userError || !userData) {
      console.log('🔐 [API] ❌ Failed to get internal user ID:', userError?.message);
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userId = userData.id;
    console.log('🔐 [API] ✅ Internal user ID:', userId);

    // Mark message as read using the new per-user function
    const { error } = await getServiceRoleClient()
      .rpc('fn_mark_message_read', {
        p_message_id: messageId,
        p_user_id: userId
      });

    if (error) {
      console.error('🔐 [API] ❌ Error marking message as read:', error);
      return json({ error: 'Failed to mark message as read' }, { status: 500 });
    }

    console.log('🔐 [API] ✅ Message marked as read successfully');

    return json({ success: true });

  } catch (error) {
    console.error('Error in PATCH /api/chat/messages/:id/read:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}