-- Fix ambiguous column references in chat functions
-- This migration fixes SQL functions that have ambiguous column references

-- Fix get_user_groups function
CREATE OR REPLACE FUNCTION get_user_groups(user_uuid UUID)
RETURNS TABLE (
    group_id UUID,
    group_name TEXT,
    group_description TEXT,
    group_avatar_url TEXT,
    user_role TEXT,
    room_count BIGINT,
    member_count BIGINT,
    latest_activity TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        g.id as group_id,
        g.name as group_name,
        g.description as group_description,
        g.avatar_url as group_avatar_url,
        gm.role as user_role,
        (SELECT COUNT(*) FROM conversations WHERE conversations.group_id = g.id AND conversations.type = 'room') as room_count,
        (SELECT COUNT(*) FROM group_members WHERE group_members.group_id = g.id AND group_members.left_at IS NULL) as member_count,
        COALESCE(
            (SELECT MAX(m.created_at) 
             FROM messages m 
             JOIN conversations c ON m.conversation_id = c.id 
             WHERE c.group_id = g.id),
            g.created_at
        ) as latest_activity
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = user_uuid 
    AND gm.left_at IS NULL
    ORDER BY latest_activity DESC;
END;
$$ LANGUAGE plpgsql;

-- Fix get_group_rooms function
CREATE OR REPLACE FUNCTION get_group_rooms(group_uuid UUID, user_uuid UUID)
RETURNS TABLE (
    room_id UUID,
    room_name TEXT,
    room_description TEXT,
    is_private BOOLEAN,
    "position" INTEGER,
    unread_count BIGINT,
    latest_message_content TEXT,
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

-- Fix get_user_conversations_enhanced function
CREATE OR REPLACE FUNCTION get_user_conversations_enhanced(user_uuid UUID)
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
        (SELECT COUNT(*) FROM conversation_participants WHERE conversation_participants.conversation_id = c.id) as participant_count,
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