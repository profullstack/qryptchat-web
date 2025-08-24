-- Fix User Auth Schema Consistency
-- Addresses the inconsistency between RLS policies and the actual schema design
-- The original RLS policies expect `id` to match `auth.uid()`, but the schema uses `auth_user_id` for that purpose

-- Drop existing RLS policies that use incorrect field references
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can read conversations they participate in" ON conversations;
DROP POLICY IF EXISTS "Users can read messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON messages;

-- Create corrected RLS policies using auth_user_id field
CREATE POLICY "Users can read own profile" ON users
    FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = auth_user_id);

-- Conversations policies - updated to use auth_user_id
CREATE POLICY "Users can read conversations they participate in" ON conversations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.conversation_id = conversations.id 
            AND u.auth_user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

-- Messages policies - updated to use auth_user_id
CREATE POLICY "Users can read messages in their conversations" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.conversation_id = messages.conversation_id 
            AND u.auth_user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

CREATE POLICY "Users can insert messages in their conversations" ON messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = messages.sender_id
            AND u.auth_user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.conversation_id = messages.conversation_id 
            AND u.auth_user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

-- Add policy for users to read profiles of conversation participants
CREATE POLICY "Users can read profiles of conversation participants" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversation_participants cp1
            JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
            JOIN users auth_user ON cp2.user_id = auth_user.id
            WHERE cp1.user_id = users.id
            AND auth_user.auth_user_id = auth.uid()
            AND cp1.left_at IS NULL
            AND cp2.left_at IS NULL
        )
    );

-- Add policy for conversation participants
CREATE POLICY "Users can read conversation participants" ON conversation_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversation_participants.user_id
            AND u.auth_user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM conversation_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.conversation_id = conversation_participants.conversation_id
            AND u.auth_user_id = auth.uid()
            AND cp.left_at IS NULL
        )
    );

-- Add policy for inserting conversation participants (for creating conversations)
CREATE POLICY "Users can insert conversation participants" ON conversation_participants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversation_participants.user_id
            AND u.auth_user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM conversations c
            JOIN users creator ON c.created_by = creator.id
            WHERE c.id = conversation_participants.conversation_id
            AND creator.auth_user_id = auth.uid()
        )
    );

-- Add policy for creating conversations
CREATE POLICY "Users can create conversations" ON conversations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversations.created_by
            AND u.auth_user_id = auth.uid()
        )
    );

-- Add policy for updating conversations (for group admins)
CREATE POLICY "Users can update conversations they created" ON conversations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = conversations.created_by
            AND u.auth_user_id = auth.uid()
        )
    );

-- Add comments for documentation
COMMENT ON POLICY "Users can read own profile" ON users IS 'Users can read their own profile using auth_user_id field';
COMMENT ON POLICY "Users can update own profile" ON users IS 'Users can update their own profile using auth_user_id field';
COMMENT ON POLICY "Users can read conversations they participate in" ON conversations IS 'Users can read conversations they participate in via auth_user_id lookup';
COMMENT ON POLICY "Users can read messages in their conversations" ON messages IS 'Users can read messages in conversations they participate in via auth_user_id lookup';
COMMENT ON POLICY "Users can insert messages in their conversations" ON messages IS 'Users can insert messages in conversations they participate in via auth_user_id lookup';