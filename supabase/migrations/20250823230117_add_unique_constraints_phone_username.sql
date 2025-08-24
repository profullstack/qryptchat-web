-- Add unique constraints for phone numbers and case-insensitive usernames
-- This migration ensures data integrity by preventing duplicate phone numbers and usernames

-- Add unique constraint on phone_number (using DO block to check if exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_phone_number_unique'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_phone_number_unique UNIQUE (phone_number);
    END IF;
END $$;

-- Add unique constraint on lowercase username for case-insensitive uniqueness
-- First create a unique index on the lowercase username
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
ON users (LOWER(username));

-- Add comment to document the case-insensitive username constraint
COMMENT ON INDEX users_username_lower_unique IS 'Ensures usernames are unique in a case-insensitive manner';