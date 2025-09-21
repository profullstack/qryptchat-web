-- Resolve Function Conflicts Migration
-- Drops the problematic overloaded function to resolve ambiguity

-- The issue: PostgreSQL has multiple versions of get_user_conversations_enhanced causing ambiguity
-- Solution: Drop only the problematic overloaded version, keep the original working one

-- Drop the overloaded function that's causing the conflict
-- This is the one with (UUID, BOOLEAN) signature that was added in the archive migration
DROP FUNCTION IF EXISTS get_user_conversations_enhanced(UUID, BOOLEAN);

-- The original function get_user_conversations_enhanced(UUID) should remain intact
-- No need to recreate it as it should still exist from the original migration

-- Add a comment for clarity
COMMENT ON FUNCTION get_user_conversations_enhanced(UUID) IS 'Original function restored - conflicts resolved';