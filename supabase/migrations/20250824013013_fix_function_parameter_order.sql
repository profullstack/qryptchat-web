-- Fix Function Parameter Order
-- Fixes the PostgreSQL function parameter order issue where parameters with default values must come after parameters without defaults

-- Drop and recreate the function with correct parameter order
DROP FUNCTION IF EXISTS create_group_with_default_room(TEXT, TEXT, UUID, BOOLEAN);

-- Function to create a group with default general room (fixed parameter order)
CREATE OR REPLACE FUNCTION create_group_with_default_room(
    group_name TEXT,
    creator_id UUID,
    group_description TEXT DEFAULT NULL,
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