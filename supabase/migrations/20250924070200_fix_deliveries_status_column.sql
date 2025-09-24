-- Fix Note to Self Unread Count - Remove Non-existent Status Column Reference
-- The get_user_conversations_enhanced function was referencing d.status which doesn't exist
-- This migration fixes the unread count logic to use the correct columns

-- Drop and recreate the function with correct column references for unread count
DROP FUNCTION IF EXISTS get_user_conversations_enhanced(UUID);

CREATE OR REPLACE FUNCTION get_user_conversations_enhanced(user_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_name TEXT,
    conversation_type TEXT,
    conversation_avatar_url TEXT,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content TEXT,
    latest_message_created_at TIMESTAMPTZ,
    latest_message_sender_name TEXT,
    unread_count BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id as conversation_id,
        CASE
            WHEN c.type = 'note_to_self' THEN 'Note to self'
            WHEN c.type = 'direct' THEN
                (SELECT u.display_name FROM users u
                 JOIN conversation_participants cp2 ON u.id = cp2.user_id
                 WHERE cp2.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            ELSE c.name
        END as conversation_name,
        c.type as conversation_type,
        CASE
            WHEN c.type = 'note_to_self' THEN NULL
            WHEN c.type = 'direct' THEN
                (SELECT u.avatar_url FROM users u
                 JOIN conversation_participants cp3 ON u.id = cp3.user_id
                 WHERE cp3.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            ELSE c.avatar_url
        END as conversation_avatar_url,
        g.name as group_name,
        (SELECT COUNT(*) FROM conversation_participants cp4 WHERE cp4.conversation_id = c.id) as participant_count,
        lm.id as latest_message_id,
        CASE
            WHEN lm.encrypted_content IS NOT NULL THEN convert_from(lm.encrypted_content, 'UTF8')
            ELSE NULL
        END as latest_message_content,
        lm.created_at as latest_message_created_at,
        lu.display_name as latest_message_sender_name,
        COALESCE((
            SELECT COUNT(*)
            FROM deliveries d
            JOIN messages m ON d.message_id = m.id
            WHERE d.recipient_user_id = user_uuid
            AND m.conversation_id = c.id
            AND d.read_ts IS NULL  -- Unread if not marked as read
            AND d.deleted_ts IS NULL  -- Not tombstoned
            AND m.deleted_at IS NULL), 0) as unread_count
    FROM conversations c
    JOIN conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN groups g ON c.group_id = g.id
    LEFT JOIN LATERAL (
        SELECT m.id, m.encrypted_content, m.created_at, m.sender_id
        FROM messages m
        WHERE m.conversation_id = c.id
        AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC
        LIMIT 1
    ) lm ON true
    LEFT JOIN users lu ON lm.sender_id = lu.id
    WHERE cp.user_id = user_uuid
    AND cp.left_at IS NULL
    ORDER BY
        -- Note-to-self conversations always appear first
        CASE WHEN c.type = 'note_to_self' THEN 0 ELSE 1 END,
        COALESCE(lm.created_at, c.created_at) DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_conversations_enhanced(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_user_conversations_enhanced(UUID) IS 'Fixed function with correct unread count logic - uses read_ts and deleted_ts instead of non-existent status column';

-- Log fix completion
DO $$
BEGIN
    RAISE NOTICE '=== DELIVERIES STATUS COLUMN FIX COMPLETED ===';
    RAISE NOTICE 'Fixed get_user_conversations_enhanced function to use correct deliveries columns';
    RAISE NOTICE 'Note-to-self conversations will now load without database errors';
END $$;