-- Temporary migration to allow cleanup of note-to-self conversations
-- This migration temporarily disables the note-to-self deletion protection
-- to allow for database cleanup operations

-- Step 1: Drop the trigger that prevents note-to-self deletion
DROP TRIGGER IF EXISTS trigger_prevent_note_to_self_deletion ON conversations;

-- Step 2: Create a temporary function that allows note-to-self deletion during cleanup
CREATE OR REPLACE FUNCTION allow_note_to_self_deletion_during_cleanup()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow all deletions during cleanup - no restrictions
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create a new trigger that allows deletion (essentially a no-op trigger)
CREATE TRIGGER trigger_allow_note_to_self_deletion_cleanup
    BEFORE DELETE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION allow_note_to_self_deletion_during_cleanup();

-- Log the change
DO $$
BEGIN
    RAISE NOTICE 'Note-to-self deletion protection temporarily disabled for cleanup operations';
    RAISE NOTICE 'Run the nuclear cleanup script now, then apply the restore migration';
END $$;