-- Fix conversation creator trigger for new conversations
-- This migration diagnoses and fixes issues with the auto_add_conversation_creator trigger

-- First, let's check if the trigger exists and is working
DO $$
BEGIN
    RAISE NOTICE 'Checking existing trigger configuration...';
    
    -- Check if trigger exists
    IF EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'trigger_auto_add_conversation_creator'
        AND event_object_table = 'conversations'
    ) THEN
        RAISE NOTICE 'Trigger trigger_auto_add_conversation_creator exists on conversations table';
    ELSE
        RAISE NOTICE 'WARNING: Trigger trigger_auto_add_conversation_creator does NOT exist!';
    END IF;
    
    -- Check if function exists
    IF EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'auto_add_conversation_creator'
        AND routine_type = 'FUNCTION'
    ) THEN
        RAISE NOTICE 'Function auto_add_conversation_creator exists';
    ELSE
        RAISE NOTICE 'WARNING: Function auto_add_conversation_creator does NOT exist!';
    END IF;
END $$;

-- Drop and recreate the trigger function with enhanced logging and error handling
DROP TRIGGER IF EXISTS trigger_auto_add_conversation_creator ON conversations;
DROP FUNCTION IF EXISTS auto_add_conversation_creator();

-- Create improved trigger function with comprehensive logging
CREATE OR REPLACE FUNCTION auto_add_conversation_creator()
RETURNS TRIGGER AS $$
BEGIN
    -- Log trigger execution
    RAISE NOTICE 'auto_add_conversation_creator trigger fired for conversation_id: %, created_by: %', NEW.id, NEW.created_by;
    
    -- Only add creator as participant if they have a created_by value
    IF NEW.created_by IS NOT NULL THEN
        RAISE NOTICE 'Adding creator % as participant to conversation %', NEW.created_by, NEW.id;
        
        -- Insert the creator as a participant with admin role
        INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
        VALUES (NEW.id, NEW.created_by, 'admin', NOW())
        ON CONFLICT (conversation_id, user_id) DO UPDATE SET
            role = EXCLUDED.role,
            joined_at = CASE 
                WHEN conversation_participants.left_at IS NOT NULL THEN EXCLUDED.joined_at
                ELSE conversation_participants.joined_at
            END,
            left_at = NULL; -- Clear left_at if they were previously removed
        
        RAISE NOTICE 'Successfully added creator % as participant to conversation %', NEW.created_by, NEW.id;
    ELSE
        RAISE NOTICE 'WARNING: Conversation % has NULL created_by, skipping participant addition', NEW.id;
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'ERROR in auto_add_conversation_creator: % - %', SQLSTATE, SQLERRM;
        RAISE NOTICE 'Failed to add creator % as participant to conversation %', NEW.created_by, NEW.id;
        -- Don't fail the entire transaction, just log the error
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger to fire after a conversation is inserted
CREATE TRIGGER trigger_auto_add_conversation_creator
    AFTER INSERT ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION auto_add_conversation_creator();

-- Verify the trigger was created successfully
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'trigger_auto_add_conversation_creator'
        AND event_object_table = 'conversations'
    ) THEN
        RAISE NOTICE 'SUCCESS: Trigger trigger_auto_add_conversation_creator created successfully';
    ELSE
        RAISE NOTICE 'ERROR: Failed to create trigger trigger_auto_add_conversation_creator';
    END IF;
END $$;

-- Test the trigger with a diagnostic query
-- Check current conversation participants to establish baseline
DO $$
DECLARE
    participant_count INTEGER;
    conversation_count INTEGER;
    rec RECORD;
BEGIN
    SELECT COUNT(*) INTO conversation_count FROM conversations;
    SELECT COUNT(*) INTO participant_count FROM conversation_participants WHERE left_at IS NULL;
    
    RAISE NOTICE 'Current database state:';
    RAISE NOTICE '  - Total conversations: %', conversation_count;
    RAISE NOTICE '  - Active participants: %', participant_count;
    
    -- Show conversations without creators as participants
    FOR rec IN (
        SELECT c.id, c.created_by, c.type, c.name,
               CASE WHEN cp.user_id IS NULL THEN 'MISSING' ELSE 'PRESENT' END as creator_participant_status
        FROM conversations c
        LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
            AND c.created_by = cp.user_id
            AND cp.left_at IS NULL
        WHERE c.created_by IS NOT NULL
        ORDER BY c.created_at DESC
        LIMIT 10
    ) LOOP
        RAISE NOTICE '  - Conversation %: created_by=%, type=%, creator_as_participant=%',
            rec.id, rec.created_by, rec.type, rec.creator_participant_status;
    END LOOP;
END $$;

-- Add any missing creators as participants for existing conversations
-- This ensures all existing conversations have their creators as participants
INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
SELECT 
    c.id as conversation_id,
    c.created_by as user_id,
    'admin' as role,
    c.created_at as joined_at
FROM conversations c
WHERE c.created_by IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM conversation_participants cp 
    WHERE cp.conversation_id = c.id 
    AND cp.user_id = c.created_by
    AND cp.left_at IS NULL
)
ON CONFLICT (conversation_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    joined_at = CASE 
        WHEN conversation_participants.left_at IS NOT NULL THEN EXCLUDED.joined_at
        ELSE conversation_participants.joined_at
    END,
    left_at = NULL;

-- Final verification
DO $$
DECLARE
    missing_creators INTEGER;
BEGIN
    SELECT COUNT(*) INTO missing_creators
    FROM conversations c
    WHERE c.created_by IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM conversation_participants cp 
        WHERE cp.conversation_id = c.id 
        AND cp.user_id = c.created_by
        AND cp.left_at IS NULL
    );
    
    IF missing_creators = 0 THEN
        RAISE NOTICE 'SUCCESS: All conversation creators are now participants in their conversations';
    ELSE
        RAISE NOTICE 'WARNING: % conversations still have missing creator participants', missing_creators;
    END IF;
END $$;