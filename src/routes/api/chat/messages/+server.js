// Messages API endpoint with disappearing messages support
// Handles message creation with automatic delivery fan-out

import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';

// Create service role client instance
const supabaseServiceRole = createServiceRoleClient();

/**
 * POST /api/chat/messages
 * Create a new message and fan out deliveries to recipients
 */
export async function POST({ request, locals }) {
  try {
    // Verify user is authenticated
    if (!locals.user?.id) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversation_id, encrypted_content, content_type = 'text', has_attachments = false, reply_to_id } = await request.json();

    // Validate required fields
    if (!conversation_id || !encrypted_content) {
      return json({ error: 'Missing required fields: conversation_id, encrypted_content' }, { status: 400 });
    }

    // Verify user is a participant in the conversation
    const { data: participant, error: participantError } = await supabaseServiceRole
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversation_id)
      .eq('user_id', locals.user.id)
      .is('left_at', null)
      .single();

    if (participantError || !participant) {
      return json({ error: 'Not authorized to send messages in this conversation' }, { status: 403 });
    }

    // Convert encrypted content to bytea format
    let contentBytes;
    try {
      if (typeof encrypted_content === 'string') {
        // Assume base64 encoded string
        contentBytes = Buffer.from(encrypted_content, 'base64');
      } else if (encrypted_content instanceof ArrayBuffer) {
        contentBytes = Buffer.from(encrypted_content);
      } else if (Array.isArray(encrypted_content)) {
        contentBytes = Buffer.from(encrypted_content);
      } else {
        throw new Error('Invalid encrypted_content format');
      }
    } catch (error) {
      return json({ error: 'Invalid encrypted content format' }, { status: 400 });
    }

    // Create the message
    const { data: message, error: messageError } = await supabaseServiceRole
      .from('messages')
      .insert([{
        conversation_id,
        sender_id: locals.user.id,
        encrypted_content: contentBytes,
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

    // Fan out deliveries to all recipients (excluding sender)
    const { error: deliveryError } = await supabaseServiceRole
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
export async function GET({ url, locals }) {
  try {
    // Verify user is authenticated
    if (!locals.user?.id) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversationId = url.searchParams.get('conversation_id');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    if (!conversationId) {
      return json({ error: 'Missing conversation_id parameter' }, { status: 400 });
    }

    // Verify user is a participant in the conversation
    const { data: participant, error: participantError } = await supabaseServiceRole
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', locals.user.id)
      .is('left_at', null)
      .single();

    if (participantError || !participant) {
      return json({ error: 'Not authorized to view messages in this conversation' }, { status: 403 });
    }

    // Get messages that haven't expired for this user
    // Join with deliveries to filter out expired messages
    const { data: messages, error: messagesError } = await supabaseServiceRole
      .from('messages')
      .select(`
        id,
        conversation_id,
        sender_id,
        encrypted_content,
        content_type,
        has_attachments,
        created_at,
        reply_to_id,
        deliveries!inner(
          delivered_ts,
          read_ts,
          expires_at,
          deleted_ts
        )
      `)
      .eq('conversation_id', conversationId)
      .eq('deliveries.recipient_user_id', locals.user.id)
      .is('deliveries.deleted_ts', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    // Transform messages for client consumption
    const transformedMessages = messages?.map(message => ({
      id: message.id,
      conversation_id: message.conversation_id,
      sender_id: message.sender_id,
      encrypted_content: message.encrypted_content ? Buffer.from(message.encrypted_content).toString('base64') : null,
      content_type: message.content_type,
      has_attachments: message.has_attachments,
      created_at: message.created_at,
      reply_to_id: message.reply_to_id,
      delivery_info: {
        delivered_ts: message.deliveries[0]?.delivered_ts,
        read_ts: message.deliveries[0]?.read_ts,
        expires_at: message.deliveries[0]?.expires_at
      }
    })) || [];

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
export async function PATCH({ request, locals, params }) {
  try {
    // Verify user is authenticated
    if (!locals.user?.id) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const messageId = params.id;
    if (!messageId) {
      return json({ error: 'Missing message ID' }, { status: 400 });
    }

    // Mark message as read using the database function
    const { error } = await supabaseServiceRole
      .rpc('fn_mark_read', { p_message_id: messageId });

    if (error) {
      console.error('Error marking message as read:', error);
      return json({ error: 'Failed to mark message as read' }, { status: 500 });
    }

    return json({ success: true });

  } catch (error) {
    console.error('Error in PATCH /api/chat/messages/:id/read:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}