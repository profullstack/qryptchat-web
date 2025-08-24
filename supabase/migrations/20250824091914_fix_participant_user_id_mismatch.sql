-- Fix specific participant user_id mismatch identified in debug output
-- The participant record has an outdated user_id that doesn't match the current user
-- This migration is now resilient to handle cases where the specific records don't exist

-- Update the participant record to use the correct user_id (if it exists)
-- From debug output:
-- - Current user: 8f9c2ef6-ed84-4b89-b48f-a56cda582aca (username: chovy)
-- - Participant record has: c10aa4db-870d-4f50-b878-034473439f44
-- - Conversation: 711b22e0-9676-418a-98a1-a50977805a04

DO $$
DECLARE
    updated_rows INTEGER;
BEGIN
    -- Attempt to update the participant record
    UPDATE conversation_participants
    SET user_id = '8f9c2ef6-ed84-4b89-b48f-a56cda582aca'
    WHERE conversation_id = '711b22e0-9676-418a-98a1-a50977805a04'
      AND user_id = 'c10aa4db-870d-4f50-b878-034473439f44';
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    IF updated_rows > 0 THEN
        RAISE NOTICE 'Successfully updated % participant record(s)', updated_rows;
    ELSE
        RAISE NOTICE 'No matching participant records found to update (this is OK for fresh databases)';
    END IF;
END $$;