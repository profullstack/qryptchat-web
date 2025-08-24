-- Fix Conversation Participants RLS Policy Final
-- Allows authenticated users to add participants to conversations
-- This fixes the issue where adding participants was blocked by RLS

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users can add participants to conversations" ON conversation_participants;

-- Create new INSERT policy that allows authenticated users to add any participants
-- This is necessary for conversation creation where users need to add other users as participants
CREATE POLICY "Authenticated users can add participants" ON conversation_participants
    FOR INSERT WITH CHECK (
        -- Allow if user is authenticated (has valid JWT)
        auth.uid() IS NOT NULL
    );

-- Add comment for documentation
COMMENT ON POLICY "Authenticated users can add participants" ON conversation_participants IS 'Allows authenticated users to add participants to conversations during conversation creation';