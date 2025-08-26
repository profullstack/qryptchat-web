-- Fix get_user_conversations function to return column names that match WebSocket handler expectations
-- The WebSocket handler expects: id, name, type, but function returns: conversation_id, conversation_name, conversation_type

-- Drop and recreate the get_user_conversations function with correct column mapping
DROP FUNCTION IF EXISTS get_user_conversations(UUID);

CREATE OR REPLACE FUNCTION get_user_conversations(user_uuid UUID)
RETURNS TABLE (
    id UUID,                           -- Maps to conversation_id
    name TEXT,                         -- Maps to conversation_name  
    type TEXT,                         -- Maps to conversation_type
    avatar_url TEXT,                   -- Maps to conversation_avatar_url
    group_id UUID,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content BYTEA,
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,      -- Add this field that WebSocket handler expects
    unread_count BIGINT
) 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
    -- Map the enhanced function columns to match WebSocket handler expectations
    RETURN QUERY 
    SELECT 
        e.conversation_id as id,                    -- conversation_id -> id
        e.conversation_name as name,                -- conversation_name -> name
        e.conversation_type as type,                -- conversation_type -> type
        e.conversation_avatar_url as avatar_url,    -- conversation_avatar_url -> avatar_url
        e.group_id,
        e.group_name,
        e.participant_count,
        e.latest_message_id,
        e.latest_message_content,
        e.latest_message_sender_id,
        e.latest_message_sender_username,
        e.latest_message_created_at,
        e.latest_message_created_at as last_message_at,  -- Duplicate for compatibility
        e.unread_count
    FROM get_user_conversations_enhanced(user_uuid) e;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_conversations(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_user_conversations(UUID) IS 'Returns user conversations with column names mapped for WebSocket handler compatibility';