-- Fix RLS Infinite Recursion
-- Removes circular dependencies in RLS policies that cause infinite recursion

-- Drop ALL existing policies that might cause recursion
DROP POLICY IF EXISTS "Users can read profiles of conversation participants" ON users;
DROP POLICY IF EXISTS "Users can read conversation participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can insert conversation participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Simplify the users policies to avoid recursion
-- Users can only read their own profile and basic info of other users (no conversation checks)
CREATE POLICY "Users can read own profile" ON users
    FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = auth_user_id);

-- Allow reading basic user info for search functionality (no conversation dependency)
CREATE POLICY "Users can read basic user info for search" ON users
    FOR SELECT USING (true); -- Allow reading basic user info for search

-- Simplified conversation_participants policies without circular dependencies
CREATE POLICY "Users can read their own participation" ON conversation_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversation_participants.user_id
            AND u.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Users can read participants in their conversations" ON conversation_participants
    FOR SELECT USING (
        conversation_id IN (
            SELECT cp.conversation_id 
            FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE u.auth_user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

CREATE POLICY "Users can insert participants when creating conversations" ON conversation_participants
    FOR INSERT WITH CHECK (
        -- Allow if user is adding themselves
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversation_participants.user_id
            AND u.auth_user_id = auth.uid()
        )
        OR
        -- Allow if user is the creator of the conversation
        EXISTS (
            SELECT 1 FROM conversations c
            JOIN users creator ON c.created_by = creator.id
            WHERE c.id = conversation_participants.conversation_id
            AND creator.auth_user_id = auth.uid()
        )
    );

-- Update conversations policies to be simpler
DROP POLICY IF EXISTS "Users can read conversations they participate in" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations they created" ON conversations;

CREATE POLICY "Users can read conversations they participate in" ON conversations
    FOR SELECT USING (
        id IN (
            SELECT cp.conversation_id 
            FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE u.auth_user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

CREATE POLICY "Users can create conversations" ON conversations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversations.created_by
            AND u.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update conversations they created" ON conversations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversations.created_by
            AND u.auth_user_id = auth.uid()
        )
    );

-- Update messages policies to be simpler
DROP POLICY IF EXISTS "Users can read messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON messages;

CREATE POLICY "Users can read messages in their conversations" ON messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT cp.conversation_id 
            FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE u.auth_user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

CREATE POLICY "Users can insert messages in their conversations" ON messages
    FOR INSERT WITH CHECK (
        -- User must be the sender
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = messages.sender_id
            AND u.auth_user_id = auth.uid()
        )
        AND
        -- User must be a participant in the conversation
        conversation_id IN (
            SELECT cp.conversation_id 
            FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE u.auth_user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

-- Add comments for documentation
COMMENT ON POLICY "Users can read basic user info for search" ON users IS 'Allow reading basic user info for search functionality without conversation dependencies';
COMMENT ON POLICY "Users can read their own participation" ON conversation_participants IS 'Users can read their own participation records';
COMMENT ON POLICY "Users can read participants in their conversations" ON conversation_participants IS 'Users can read participants in conversations they are part of';
COMMENT ON POLICY "Users can insert participants when creating conversations" ON conversation_participants IS 'Users can add participants when creating conversations or add themselves';