-- Add user profile fields for public profiles
-- This migration adds bio and website fields to support user profiles

-- Add bio and website fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT;

-- Add RLS policy for users to update their own profile fields
CREATE POLICY "Users can update their own profile fields" ON users
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Add RLS policy for public read access to user profiles
CREATE POLICY "Anyone can view user profiles" ON users
FOR SELECT USING (true);

-- Create index on username for efficient profile lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);