-- Fix Conversations RLS Policies for Null created_by
-- Updates RLS policies to handle cases where created_by can be null
-- This allows conversations to be created by authenticated users even if they don't exist in the users table

-- Drop the existing INSERT policy that requires created_by to exist in users table
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;

-- Create new INSERT policy that allows authenticated users to create conversations
-- regardless of whether they exist in the users table
CREATE POLICY "Authenticated users can create conversations" ON conversations
    FOR INSERT WITH CHECK (
        -- Allow if user is authenticated (has valid JWT)
        auth.uid() IS NOT NULL
        AND (
            -- Either created_by is null (user not in users table yet)
            conversations.created_by IS NULL
            OR
            -- Or created_by matches an existing user linked to the authenticated user
            EXISTS (
                SELECT 1 FROM users u
                WHERE u.id = conversations.created_by
                AND u.auth_user_id = auth.uid()
            )
        )
    );

-- Update the existing SELECT policy to handle null created_by
DROP POLICY IF EXISTS "Users can read own conversations" ON conversations;

CREATE POLICY "Users can read own conversations" ON conversations
    FOR SELECT USING (
        -- Allow if created_by is null (system will handle filtering)
        conversations.created_by IS NULL
        OR
        -- Or if user created the conversation
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversations.created_by
            AND u.auth_user_id = auth.uid()
        )
    );

-- Update the existing UPDATE policy to handle null created_by
DROP POLICY IF EXISTS "Users can update own conversations" ON conversations;

CREATE POLICY "Users can update own conversations" ON conversations
    FOR UPDATE USING (
        -- Allow if created_by is null and user is authenticated
        (conversations.created_by IS NULL AND auth.uid() IS NOT NULL)
        OR
        -- Or if user created the conversation
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversations.created_by
            AND u.auth_user_id = auth.uid()
        )
    );

-- Add comments for documentation
COMMENT ON POLICY "Authenticated users can create conversations" ON conversations IS 'Allows authenticated users to create conversations even if they do not exist in users table yet';
COMMENT ON POLICY "Users can read own conversations" ON conversations IS 'Users can read conversations they created or conversations with null created_by';
COMMENT ON POLICY "Users can update own conversations" ON conversations IS 'Users can update conversations they created or conversations with null created_by';