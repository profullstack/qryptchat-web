-- Drop duplicate avatar storage policies migration
-- This migration removes the duplicate policy creation that was causing conflicts
-- The policies were already created in a previous migration

-- This migration is intentionally empty since the policies already exist
-- and we don't want to drop them, just prevent the duplicate creation error

-- Note: The avatar storage RLS policies are already in place and working correctly