-- Fix Encrypted Content Type Mismatch
-- Updates existing functions to handle the new BYTEA type for encrypted_content

-- Drop and recreate get_group_rooms function to handle BYTEA encrypted_content
DROP FUNCTION IF EXISTS get_group_rooms(UUID, UUID);
CREATE FUNCTION get_group_rooms(group_uuid UUID, user_uuid UUID)
RETURNS TABLE (
    room_id UUID,
    room_name TEXT,
    room_description TEXT,
    is_private BOOLEAN,
    "position" INTEGER,
    unread_count BIGINT,
    latest_message_content BYTEA,  -- Changed from TEXT to BYTEA
    latest_message_created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as room_id,
        c.name as room_name,
        c.description as room_description,
        c.is_private,
        c.position,
        (SELECT COUNT(*) FROM messages m 
         LEFT JOIN message_status ms ON m.id = ms.message_id AND ms.user_id = user_uuid
         WHERE m.conversation_id = c.id 
         AND m.sender_id != user_uuid 
         AND (ms.status IS NULL OR ms.status != 'read')
         AND m.deleted_at IS NULL) as unread_count,
        lm.encrypted_content as latest_message_content,
        lm.created_at as latest_message_created_at
    FROM conversations c
    JOIN conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN LATERAL (
        SELECT m.encrypted_content, m.created_at 
        FROM messages m 
        WHERE m.conversation_id = c.id 
        AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC 
        LIMIT 1
    ) lm ON true
    WHERE c.group_id = group_uuid 
    AND c.type = 'room'
    AND cp.user_id = user_uuid 
    AND cp.left_at IS NULL
    ORDER BY c.position ASC, c.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate get_user_conversations_enhanced function to handle BYTEA encrypted_content
DROP FUNCTION IF EXISTS get_user_conversations_enhanced(UUID);
CREATE FUNCTION get_user_conversations_enhanced(user_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    conversation_avatar_url TEXT,
    group_id UUID,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content BYTEA,  -- Changed from TEXT to BYTEA
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    unread_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as conversation_id,
        c.type as conversation_type,
        CASE 
            WHEN c.type = 'direct' THEN 
                (SELECT u.display_name FROM users u 
                 JOIN conversation_participants cp ON u.id = cp.user_id 
                 WHERE cp.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            WHEN c.type = 'room' THEN c.name
            ELSE c.name
        END as conversation_name,
        CASE 
            WHEN c.type = 'direct' THEN 
                (SELECT u.avatar_url FROM users u 
                 JOIN conversation_participants cp ON u.id = cp.user_id 
                 WHERE cp.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            ELSE c.avatar_url
        END as conversation_avatar_url,
        c.group_id,
        g.name as group_name,
        (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id) as participant_count,
        lm.id as latest_message_id,
        lm.encrypted_content as latest_message_content,
        lm.sender_id as latest_message_sender_id,
        lu.username as latest_message_sender_username,
        lm.created_at as latest_message_created_at,
        (SELECT COUNT(*) FROM messages m 
         LEFT JOIN message_status ms ON m.id = ms.message_id AND ms.user_id = user_uuid
         WHERE m.conversation_id = c.id 
         AND m.sender_id != user_uuid 
         AND (ms.status IS NULL OR ms.status != 'read')
         AND m.deleted_at IS NULL) as unread_count
    FROM conversations c
    JOIN conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN groups g ON c.group_id = g.id
    LEFT JOIN LATERAL (
        SELECT m.* FROM messages m 
        WHERE m.conversation_id = c.id 
        AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC 
        LIMIT 1
    ) lm ON true
    LEFT JOIN users lu ON lm.sender_id = lu.id
    WHERE cp.user_id = user_uuid 
    AND cp.left_at IS NULL
    ORDER BY COALESCE(lm.created_at, c.created_at) DESC;
END;
$$ LANGUAGE plpgsql;

-- Check if there are any other functions that might need updating
-- This query will help identify any other functions that reference encrypted_content
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Log any other functions that might reference encrypted_content
    FOR func_record IN 
        SELECT proname, prosrc 
        FROM pg_proc 
        WHERE prosrc LIKE '%encrypted_content%'
        AND proname NOT IN ('get_group_rooms', 'get_user_conversations_enhanced')
    LOOP
        RAISE NOTICE 'Function % may need review for encrypted_content type: %', func_record.proname, left(func_record.prosrc, 100);
    END LOOP;
END $$;

-- Drop and recreate get_user_conversations function to handle BYTEA encrypted_content
DROP FUNCTION IF EXISTS get_user_conversations(UUID);
CREATE FUNCTION get_user_conversations(user_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    conversation_avatar_url TEXT,
    group_id UUID,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content BYTEA,  -- Changed from TEXT to BYTEA
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    unread_count BIGINT
) AS $$
BEGIN
    -- Use the enhanced function
    RETURN QUERY SELECT * FROM get_user_conversations_enhanced(user_uuid);
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION get_group_rooms(UUID, UUID) IS 'Updated to return BYTEA for encrypted_content column';
COMMENT ON FUNCTION get_user_conversations_enhanced(UUID) IS 'Updated to return BYTEA for encrypted_content column';
COMMENT ON FUNCTION get_user_conversations(UUID) IS 'Updated to return BYTEA for encrypted_content column';