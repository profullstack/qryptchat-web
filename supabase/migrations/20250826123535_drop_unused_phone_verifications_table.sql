-- Drop unused phone_verifications table
-- This table was created in the initial migration but is not used by the application
-- SMS verification is handled by Supabase Auth's built-in phone verification system

-- Drop the table and its associated objects
DROP TABLE IF EXISTS phone_verifications CASCADE;

-- Drop the cleanup function that was associated with this table
DROP FUNCTION IF EXISTS cleanup_expired_verifications() CASCADE;

-- Drop any indexes that might have been created for this table
DROP INDEX IF EXISTS idx_phone_verifications_phone_number;
DROP INDEX IF EXISTS idx_phone_verifications_expires_at;

-- Add comment for documentation
COMMENT ON SCHEMA public IS 'Removed unused phone_verifications table - SMS verification handled by Supabase Auth';