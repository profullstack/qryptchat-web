-- Add Note to Self Conversations Migration
-- This migration implements the special conversation type approach for note-to-self feature
-- Similar to Signal's "Note to self" functionality

-- Step 1: Update conversation type constraint to include 'note_to_self'
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
    CHECK (type IN ('direct', 'group', 'room', 'note_to_self'));

-- Step 2: Create note-to-self conversations for all existing users
INSERT INTO conversations (id, type, name, created_by, created_at, updated_at)
SELECT 
    uuid_generate_v4(),
    'note_to_self',
    'Note to self',
    u.id,
    NOW(),
    NOW()
FROM users u
WHERE u.id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM conversations c 
    WHERE c.created_by = u.id AND c.type = 'note_to_self'
)
ON CONFLICT DO NOTHING;

-- Step 3: Add users as participants in their note-to-self conversations
INSERT INTO conversation_participants (id, conversation_id, user_id, role, joined_at)
SELECT 
    uuid_generate_v4(),
    c.id,
    c.created_by,
    'admin',
    c.created_at
FROM conversations c
WHERE c.type = 'note_to_self'
AND c.created_by IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = c.id AND cp.user_id = c.created_by
)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Step 4: Create trigger to automatically create note-to-self conversation for new users
CREATE OR REPLACE FUNCTION auto_create_note_to_self_conversation()
RETURNS TRIGGER AS $$
DECLARE
    new_conversation_id UUID;
BEGIN
    -- Only create for users with valid auth_user_id (properly authenticated users)
    IF NEW.auth_user_id IS NOT NULL THEN
        -- Create note-to-self conversation
        INSERT INTO conversations (id, type, name, created_by, created_at, updated_at)
        VALUES (
            uuid_generate_v4(),
            'note_to_self',
            'Note to self',
            NEW.id,
            NOW(),
            NOW()
        )
        RETURNING id INTO new_conversation_id;

        -- Add user as participant in their note-to-self conversation
        INSERT INTO conversation_participants (id, conversation_id, user_id, role, joined_at)
        VALUES (
            uuid_generate_v4(),
            new_conversation_id,
            NEW.id,
            'admin',
            NOW()
        );

        RAISE NOTICE 'Created note-to-self conversation % for user %', new_conversation_id, NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new users
DROP TRIGGER IF EXISTS trigger_auto_create_note_to_self ON users;
CREATE TRIGGER trigger_auto_create_note_to_self
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_note_to_self_conversation();

-- Step 5: Create function to prevent archiving/deleting note-to-self conversations
CREATE OR REPLACE FUNCTION prevent_note_to_self_archival()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent archiving of note-to-self conversations
    IF TG_OP = 'UPDATE' AND NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
        -- Check if this is a note-to-self conversation
        IF EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = NEW.conversation_id 
            AND c.type = 'note_to_self'
        ) THEN
            RAISE EXCEPTION 'Cannot archive note-to-self conversations';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to prevent archiving note-to-self conversations
DROP TRIGGER IF EXISTS trigger_prevent_note_to_self_archival ON conversation_participants;
CREATE TRIGGER trigger_prevent_note_to_self_archival
    BEFORE UPDATE ON conversation_participants
    FOR EACH ROW
    EXECUTE FUNCTION prevent_note_to_self_archival();

-- Step 6: Create function to prevent deletion of note-to-self conversations
CREATE OR REPLACE FUNCTION prevent_note_to_self_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent deletion of note-to-self conversations
    IF OLD.type = 'note_to_self' THEN
        RAISE EXCEPTION 'Cannot delete note-to-self conversations';
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to prevent deletion of note-to-self conversations
DROP TRIGGER IF EXISTS trigger_prevent_note_to_self_deletion ON conversations;
CREATE TRIGGER trigger_prevent_note_to_self_deletion
    BEFORE DELETE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION prevent_note_to_self_deletion();

-- Step 7: Update get_user_conversations_enhanced function to properly handle note-to-self conversations
-- This ensures note-to-self conversations are always returned first
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
            ELSE lm.content
        END as latest_message_content,
        lm.created_at as latest_message_created_at,
        lu.display_name as latest_message_sender_name,
        COALESCE((
            SELECT COUNT(*) 
            FROM deliveries d 
            JOIN messages m ON d.message_id = m.id 
            WHERE d.recipient_user_id = user_uuid 
            AND m.conversation_id = c.id 
            AND d.status IN ('sent', 'delivered')
            AND m.deleted_at IS NULL), 0) as unread_count
    FROM conversations c
    JOIN conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN groups g ON c.group_id = g.id
    LEFT JOIN LATERAL (
        SELECT m.id, m.content, m.encrypted_content, m.created_at, m.sender_id
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

-- Add comments for documentation
COMMENT ON CONSTRAINT conversations_type_check ON conversations IS 'Conversation types: direct, group, room, note_to_self';
COMMENT ON FUNCTION auto_create_note_to_self_conversation() IS 'Automatically creates note-to-self conversation for new users';
COMMENT ON FUNCTION prevent_note_to_self_archival() IS 'Prevents archiving of note-to-self conversations';
COMMENT ON FUNCTION prevent_note_to_self_deletion() IS 'Prevents deletion of note-to-self conversations';
COMMENT ON FUNCTION get_user_conversations_enhanced(UUID) IS 'Returns user conversations with note-to-self conversations prioritized first';

-- Log migration completion
DO $$
DECLARE
    note_to_self_count INTEGER;
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO note_to_self_count FROM conversations WHERE type = 'note_to_self';
    SELECT COUNT(*) INTO user_count FROM users WHERE auth_user_id IS NOT NULL;
    
    RAISE NOTICE '=== NOTE TO SELF MIGRATION COMPLETED ===';
    RAISE NOTICE 'Users with auth_user_id: %', user_count;
    RAISE NOTICE 'Note-to-self conversations created: %', note_to_self_count;
    
    IF note_to_self_count > 0 THEN
        RAISE NOTICE 'SUCCESS: Note-to-self conversations have been created for existing users';
    ELSE
        RAISE NOTICE 'INFO: No note-to-self conversations created (no users found)';
    END IF;
END $$;