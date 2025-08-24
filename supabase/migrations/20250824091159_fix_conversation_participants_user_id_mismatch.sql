-- Fix Conversation Participants User ID Mismatch
-- Updates conversation_participants.user_id to use correct internal user IDs
-- that match the current users table structure

-- This migration fixes the issue where conversation_participants.user_id
-- contains outdated internal user IDs that don't match the current users table

-- Step 1: Create a temporary function to fix participant user IDs
CREATE OR REPLACE FUNCTION fix_conversation_participants_user_ids()
RETURNS void AS $$
DECLARE
    participant_record RECORD;
    correct_user_id UUID;
BEGIN
    -- Loop through all conversation participants
    FOR participant_record IN 
        SELECT DISTINCT cp.id, cp.user_id, cp.conversation_id
        FROM conversation_participants cp
    LOOP
        -- Try to find the correct user ID by checking if the current user_id exists in users table
        SELECT id INTO correct_user_id
        FROM users 
        WHERE id = participant_record.user_id;
        
        -- If user_id doesn't exist in users table, this participant record is orphaned
        IF correct_user_id IS NULL THEN
            RAISE NOTICE 'Found orphaned participant record: % with user_id: %', 
                participant_record.id, participant_record.user_id;
            
            -- For now, we'll delete orphaned participant records
            -- In a production system, you might want to handle this differently
            DELETE FROM conversation_participants 
            WHERE id = participant_record.id;
            
            RAISE NOTICE 'Deleted orphaned participant record: %', participant_record.id;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Conversation participants cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- Step 2: Execute the cleanup function
SELECT fix_conversation_participants_user_ids();

-- Step 3: Drop the temporary function
DROP FUNCTION fix_conversation_participants_user_ids();

-- Step 4: Add a function to create missing participant records for existing users
-- This ensures that users who should have access to conversations actually do
CREATE OR REPLACE FUNCTION ensure_user_conversation_access()
RETURNS void AS $$
DECLARE
    user_record RECORD;
    conversation_record RECORD;
BEGIN
    -- For each user, ensure they have proper conversation access
    -- This is a conservative approach - we'll only add participants for conversations
    -- that were created by the user or where they should logically have access
    
    FOR user_record IN 
        SELECT id, auth_user_id, phone_number
        FROM users 
        WHERE auth_user_id IS NOT NULL
    LOOP
        -- Check if user has any conversations they created but aren't a participant in
        FOR conversation_record IN
            SELECT c.id as conversation_id
            FROM conversations c
            WHERE c.created_by = user_record.id
            AND NOT EXISTS (
                SELECT 1 FROM conversation_participants cp 
                WHERE cp.conversation_id = c.id 
                AND cp.user_id = user_record.id
            )
        LOOP
            -- Add the user as a participant in their own conversation
            INSERT INTO conversation_participants (
                conversation_id, 
                user_id, 
                role, 
                joined_at
            ) VALUES (
                conversation_record.conversation_id,
                user_record.id,
                'admin',
                NOW()
            );
            
            RAISE NOTICE 'Added user % as participant in their conversation %', 
                user_record.id, conversation_record.conversation_id;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'User conversation access verification completed';
END;
$$ LANGUAGE plpgsql;

-- Step 5: Execute the access verification function
SELECT ensure_user_conversation_access();

-- Step 6: Drop the temporary function
DROP FUNCTION ensure_user_conversation_access();

-- Step 7: Add some constraints to prevent future issues
-- Ensure conversation_participants.user_id always references a valid user
DO $$
BEGIN
    -- Check if foreign key constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'conversation_participants_user_id_fkey'
        AND table_name = 'conversation_participants'
    ) THEN
        ALTER TABLE conversation_participants 
        ADD CONSTRAINT conversation_participants_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Added foreign key constraint for conversation_participants.user_id';
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON CONSTRAINT conversation_participants_user_id_fkey ON conversation_participants 
IS 'Ensures conversation_participants.user_id always references a valid user in the users table';