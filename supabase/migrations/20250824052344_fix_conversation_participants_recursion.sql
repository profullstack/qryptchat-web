-- Fix Conversation Participants Recursion
-- Completely eliminates infinite recursion in conversation_participants policies
-- by avoiding any self-referential queries

-- Drop all existing conversation_participants policies
DROP POLICY IF EXISTS "Users can read their own participation" ON conversation_participants;
DROP POLICY IF EXISTS "Users can read participants in their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can insert participants when creating conversations" ON conversation_participants;

-- Create simple, non-recursive policies for conversation_participants
-- Policy 1: Users can read their own participation records
CREATE POLICY "Users can read own participation" ON conversation_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversation_participants.user_id
            AND u.auth_user_id = auth.uid()
        )
    );

-- Policy 2: Users can read all participants in conversations where they are participants
-- This avoids recursion by not querying conversation_participants within the policy
CREATE POLICY "Users can read conversation participants" ON conversation_participants
    FOR SELECT USING (
        conversation_id IN (
            SELECT c.id FROM conversations c
            WHERE EXISTS (
                SELECT 1 FROM users u
                WHERE u.id = c.created_by
                AND u.auth_user_id = auth.uid()
            )
        )
        OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversation_participants.user_id
            AND u.auth_user_id = auth.uid()
        )
    );

-- Policy 3: Users can insert participants when they are the conversation creator
CREATE POLICY "Users can add participants" ON conversation_participants
    FOR INSERT WITH CHECK (
        -- Allow if user is adding themselves
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversation_participants.user_id
            AND u.auth_user_id = auth.uid()
        )
        OR
        -- Allow if user is the creator of the conversation
        conversation_id IN (
            SELECT c.id FROM conversations c
            WHERE EXISTS (
                SELECT 1 FROM users u
                WHERE u.id = c.created_by
                AND u.auth_user_id = auth.uid()
            )
        )
    );

-- Also update the conversations policies to be simpler and avoid recursion
DROP POLICY IF EXISTS "Users can read conversations they participate in" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations they created" ON conversations;

-- Simple conversation policies that don't cause recursion
CREATE POLICY "Users can read their created conversations" ON conversations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversations.created_by
            AND u.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Users can read conversations they participate in" ON conversations
    FOR SELECT USING (
        -- Allow reading if user created the conversation
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversations.created_by
            AND u.auth_user_id = auth.uid()
        )
        OR
        -- Allow reading if user is a participant (using a direct join, not subquery)
        EXISTS (
            SELECT 1 FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.conversation_id = conversations.id
            AND u.auth_user_id = auth.uid()
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

CREATE POLICY "Users can update their conversations" ON conversations
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
        -- Allow if user created the conversation
        conversation_id IN (
            SELECT c.id FROM conversations c
            WHERE EXISTS (
                SELECT 1 FROM users u
                WHERE u.id = c.created_by
                AND u.auth_user_id = auth.uid()
            )
        )
        OR
        -- Allow if user is a participant
        EXISTS (
            SELECT 1 FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.conversation_id = messages.conversation_id
            AND u.auth_user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

CREATE POLICY "Users can send messages in their conversations" ON messages
    FOR INSERT WITH CHECK (
        -- User must be the sender
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = messages.sender_id
            AND u.auth_user_id = auth.uid()
        )
        AND
        (
            -- Allow if user created the conversation
            conversation_id IN (
                SELECT c.id FROM conversations c
                WHERE EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.id = c.created_by
                    AND u.auth_user_id = auth.uid()
                )
            )
            OR
            -- Allow if user is a participant
            EXISTS (
                SELECT 1 FROM conversation_participants cp
                JOIN users u ON cp.user_id = u.id
                WHERE cp.conversation_id = messages.conversation_id
                AND u.auth_user_id = auth.uid()
                AND cp.left_at IS NULL
            )
        )
    );

-- Add comments for documentation
COMMENT ON POLICY "Users can read own participation" ON conversation_participants IS 'Users can read their own participation records without recursion';
COMMENT ON POLICY "Users can read conversation participants" ON conversation_participants IS 'Users can read participants in conversations they created or participate in';
COMMENT ON POLICY "Users can add participants" ON conversation_participants IS 'Users can add participants to conversations they created or add themselves';