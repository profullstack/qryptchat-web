-- Chat Archiving Support Migration
-- Adds per-user chat archiving functionality - conversations can be archived by individual users

-- Add archived_at column to conversation_participants for per-user archiving
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Add index for archived conversations queries
CREATE INDEX IF NOT EXISTS idx_conversation_participants_archived_at ON conversation_participants(archived_at) WHERE archived_at IS NOT NULL;

-- Function to archive a conversation for a specific user
CREATE OR REPLACE FUNCTION archive_conversation(
    conversation_uuid UUID,
    user_uuid UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Get the internal user ID from auth user ID
    DECLARE
        internal_user_id UUID;
    BEGIN
        SELECT id INTO internal_user_id
        FROM users 
        WHERE auth_user_id::text = user_uuid::text;
        
        IF internal_user_id IS NULL THEN
            RETURN FALSE;
        END IF;
        
        -- Update the conversation participant to mark as archived
        UPDATE conversation_participants 
        SET archived_at = NOW()
        WHERE conversation_id = conversation_uuid 
        AND user_id = internal_user_id 
        AND left_at IS NULL
        AND archived_at IS NULL;
        
        -- Return true if a row was updated
        RETURN FOUND;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unarchive a conversation for a specific user
CREATE OR REPLACE FUNCTION unarchive_conversation(
    conversation_uuid UUID,
    user_uuid UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Get the internal user ID from auth user ID
    DECLARE
        internal_user_id UUID;
    BEGIN
        SELECT id INTO internal_user_id
        FROM users 
        WHERE auth_user_id::text = user_uuid::text;
        
        IF internal_user_id IS NULL THEN
            RETURN FALSE;
        END IF;
        
        -- Update the conversation participant to unarchive
        UPDATE conversation_participants 
        SET archived_at = NULL
        WHERE conversation_id = conversation_uuid 
        AND user_id = internal_user_id 
        AND left_at IS NULL
        AND archived_at IS NOT NULL;
        
        -- Return true if a row was updated
        RETURN FOUND;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced get_user_conversations function that excludes archived conversations by default
CREATE OR REPLACE FUNCTION get_user_conversations_enhanced(
    user_uuid UUID,
    include_archived BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    conversation_avatar_url TEXT,
    group_id UUID,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content TEXT,
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    unread_count BIGINT,
    is_archived BOOLEAN,
    archived_at TIMESTAMPTZ
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
         AND m.deleted_at IS NULL) as unread_count,
        (cp.archived_at IS NOT NULL) as is_archived,
        cp.archived_at
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
    AND (include_archived = TRUE OR cp.archived_at IS NULL)
    ORDER BY 
        CASE WHEN cp.archived_at IS NOT NULL THEN 1 ELSE 0 END,
        COALESCE(lm.created_at, c.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get only archived conversations for a user
CREATE OR REPLACE FUNCTION get_user_archived_conversations(user_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    conversation_avatar_url TEXT,
    group_id UUID,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content TEXT,
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    unread_count BIGINT,
    archived_at TIMESTAMPTZ
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
         AND m.deleted_at IS NULL) as unread_count,
        cp.archived_at
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
    AND cp.archived_at IS NOT NULL
    ORDER BY cp.archived_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION archive_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unarchive_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_conversations_enhanced(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_archived_conversations(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION archive_conversation(UUID, UUID) IS 'Archives a conversation for a specific user';
COMMENT ON FUNCTION unarchive_conversation(UUID, UUID) IS 'Unarchives a conversation for a specific user';
COMMENT ON FUNCTION get_user_conversations_enhanced(UUID, BOOLEAN) IS 'Gets user conversations with optional inclusion of archived conversations';
COMMENT ON FUNCTION get_user_archived_conversations(UUID) IS 'Gets only archived conversations for a user';
COMMENT ON COLUMN conversation_participants.archived_at IS 'When the user archived this conversation (NULL = not archived)';