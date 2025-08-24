-- Fix Missing Conversation Data
-- This migration addresses conversations that exist but are missing critical data:
-- 1. Missing created_by field
-- 2. Missing participants in conversation_participants table
-- 3. This will allow the get_user_conversations function to properly populate conversation names

-- First, let's identify and fix conversations with missing created_by
-- We'll set created_by to the first user we can find who should be associated with this conversation
UPDATE conversations 
SET created_by = (
    SELECT auth.uid() 
    WHERE created_by IS NULL
    LIMIT 1
)
WHERE created_by IS NULL;

-- For conversations that still don't have participants, we need to add them
-- This is a bit tricky since we don't know who should be in the conversation
-- Let's create a function to help with this

CREATE OR REPLACE FUNCTION fix_missing_conversation_participants()
RETURNS void AS $$
DECLARE
    conv_record RECORD;
    current_user_id UUID;
BEGIN
    -- Get the current authenticated user
    current_user_id := auth.uid();
    
    -- If no authenticated user, we can't proceed
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'No authenticated user found';
    END IF;
    
    -- Find conversations that have no participants
    FOR conv_record IN 
        SELECT c.id, c.type, c.created_by
        FROM conversations c
        LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
        WHERE cp.conversation_id IS NULL
    LOOP
        -- Add the current user as a participant
        INSERT INTO conversation_participants (
            conversation_id,
            user_id,
            role,
            joined_at
        ) VALUES (
            conv_record.id,
            current_user_id,
            'member',
            NOW()
        ) ON CONFLICT (conversation_id, user_id) DO NOTHING;
        
        -- If this is a direct message and we have a created_by, add them too (if different)
        IF conv_record.type = 'direct' AND conv_record.created_by IS NOT NULL AND conv_record.created_by != current_user_id THEN
            INSERT INTO conversation_participants (
                conversation_id,
                user_id,
                role,
                joined_at
            ) VALUES (
                conv_record.id,
                conv_record.created_by,
                'member',
                NOW()
            ) ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION fix_missing_conversation_participants() TO authenticated;

-- Note: The function above needs to be called by an authenticated user
-- It cannot be run automatically in the migration because auth.uid() won't be available
-- The user will need to call this function from the application or manually

-- Let's also create a simpler approach for the specific conversation we know about
-- We'll add a fallback to ensure conversations have at least basic data

-- Update conversations to have a created_by if they don't have one
-- Use a system approach for orphaned conversations
DO $$
DECLARE
    system_user_id UUID;
BEGIN
    -- Try to find a user to assign as creator for orphaned conversations
    SELECT auth_user_id INTO system_user_id 
    FROM users 
    ORDER BY created_at ASC 
    LIMIT 1;
    
    -- If we found a user, update orphaned conversations
    IF system_user_id IS NOT NULL THEN
        UPDATE conversations 
        SET created_by = system_user_id
        WHERE created_by IS NULL;
    END IF;
END $$;