-- Add bio and website fields to user profiles
-- This migration adds bio and website columns to the users table for profile information

-- Add bio and website columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT;

-- Create index on username for efficient profile lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Update RLS policies to allow users to update their own profile fields
-- Policy for users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Policy for public profile viewing
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON users;
CREATE POLICY "Public profiles are viewable by everyone" ON users
    FOR SELECT USING (true);