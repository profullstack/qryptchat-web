-- Groups and Rooms Support Migration
-- Enhances the existing conversation system to support Discord/Telegram-like groups with multiple rooms

-- Create groups table for organizing multiple rooms
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    invite_code TEXT UNIQUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create group_members table for group membership
CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    UNIQUE(group_id, user_id)
);

-- Add group_id to conversations table to link rooms to groups
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;

-- Add room-specific fields to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Update conversation type to include 'room'
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check 
    CHECK (type IN ('direct', 'group', 'room'));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_group_id ON conversations(group_id);
CREATE INDEX IF NOT EXISTS idx_conversations_position ON conversations(position);

-- Create trigger for groups updated_at
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique invite codes
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    exists BOOLEAN;
BEGIN
    LOOP
        -- Generate 8-character alphanumeric code
        code := upper(substring(md5(random()::text) from 1 for 8));
        
        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM groups WHERE invite_code = code) INTO exists;
        
        -- Exit loop if code is unique
        IF NOT exists THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Function to create a group with default general room
CREATE OR REPLACE FUNCTION create_group_with_default_room(
    group_name TEXT,
    group_description TEXT DEFAULT NULL,
    creator_id UUID,
    is_public_group BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    group_id UUID,
    room_id UUID,
    invite_code TEXT
) AS $$
DECLARE
    new_group_id UUID;
    new_room_id UUID;
    new_invite_code TEXT;
BEGIN
    -- Generate invite code
    new_invite_code := generate_invite_code();
    
    -- Create the group
    INSERT INTO groups (name, description, created_by, is_public, invite_code)
    VALUES (group_name, group_description, creator_id, is_public_group, new_invite_code)
    RETURNING id INTO new_group_id;
    
    -- Add creator as owner
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (new_group_id, creator_id, 'owner');
    
    -- Create default "general" room
    INSERT INTO conversations (type, name, group_id, created_by, position)
    VALUES ('room', 'general', new_group_id, creator_id, 0)
    RETURNING id INTO new_room_id;
    
    -- Add creator to the room
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (new_room_id, creator_id, 'admin');
    
    RETURN QUERY SELECT new_group_id, new_room_id, new_invite_code;
END;
$$ LANGUAGE plpgsql;

-- Function to join group by invite code
CREATE OR REPLACE FUNCTION join_group_by_invite(
    invite_code_param TEXT,
    user_id_param UUID
)
RETURNS TABLE (
    success BOOLEAN,
    group_id UUID,
    message TEXT
) AS $$
DECLARE
    target_group_id UUID;
    is_already_member BOOLEAN;
BEGIN
    -- Find group by invite code
    SELECT id INTO target_group_id
    FROM groups 
    WHERE invite_code = invite_code_param;
    
    IF target_group_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Invalid invite code';
        RETURN;
    END IF;
    
    -- Check if user is already a member
    SELECT EXISTS(
        SELECT 1 FROM group_members 
        WHERE group_id = target_group_id 
        AND user_id = user_id_param 
        AND left_at IS NULL
    ) INTO is_already_member;
    
    IF is_already_member THEN
        RETURN QUERY SELECT FALSE, target_group_id, 'Already a member of this group';
        RETURN;
    END IF;
    
    -- Add user to group
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (target_group_id, user_id_param, 'member')
    ON CONFLICT (group_id, user_id) 
    DO UPDATE SET left_at = NULL, joined_at = NOW();
    
    -- Add user to all public rooms in the group
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT c.id, user_id_param, 'member'
    FROM conversations c
    WHERE c.group_id = target_group_id 
    AND c.type = 'room'
    AND c.is_private = FALSE
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    RETURN QUERY SELECT TRUE, target_group_id, 'Successfully joined group';
END;
$$ LANGUAGE plpgsql;

-- Function to get user groups with room counts
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
        (SELECT COUNT(*) FROM conversations WHERE group_id = g.id AND type = 'room') as room_count,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id AND left_at IS NULL) as member_count,
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

-- Function to get rooms in a group
CREATE OR REPLACE FUNCTION get_group_rooms(group_uuid UUID, user_uuid UUID)
RETURNS TABLE (
    room_id UUID,
    room_name TEXT,
    room_description TEXT,
    is_private BOOLEAN,
    position INTEGER,
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

-- Enhanced get_user_conversations function to include groups and rooms
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

-- Enable RLS on new tables
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for groups
CREATE POLICY "Users can read groups they are members of" ON groups
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_members 
            WHERE group_id = id 
            AND user_id::text = auth.uid()::text
            AND left_at IS NULL
        )
        OR is_public = TRUE
    );

CREATE POLICY "Users can update groups they own or admin" ON groups
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM group_members 
            WHERE group_id = id 
            AND user_id::text = auth.uid()::text
            AND role IN ('owner', 'admin')
            AND left_at IS NULL
        )
    );

-- RLS policies for group_members
CREATE POLICY "Users can read group members for groups they belong to" ON group_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM group_members gm2
            WHERE gm2.group_id = group_members.group_id 
            AND gm2.user_id::text = auth.uid()::text
            AND gm2.left_at IS NULL
        )
    );

CREATE POLICY "Users can insert themselves into groups" ON group_members
    FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

-- Update existing conversation policies to handle rooms
DROP POLICY IF EXISTS "Users can read conversations they participate in" ON conversations;
CREATE POLICY "Users can read conversations they participate in" ON conversations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = id 
            AND user_id::text = auth.uid()::text
            AND left_at IS NULL
        )
        OR (
            group_id IS NOT NULL 
            AND EXISTS (
                SELECT 1 FROM group_members 
                WHERE group_id = conversations.group_id 
                AND user_id::text = auth.uid()::text
                AND left_at IS NULL
            )
        )
    );