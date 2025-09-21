-- Fix encrypted_files RLS policies to handle auth user ID vs internal user ID mapping

-- Drop existing policies and recreate with proper user ID mapping
DROP POLICY IF EXISTS "Users can view encrypted files from their conversations" ON encrypted_files;
DROP POLICY IF EXISTS "Users can upload encrypted files to their conversations" ON encrypted_files;
DROP POLICY IF EXISTS "Users can delete their own encrypted files" ON encrypted_files;

-- RLS Policy: Users can view files from conversations they participate in
CREATE POLICY "Users can view encrypted files from their conversations"
ON encrypted_files FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
    JOIN users u ON cp.user_id = u.id
    WHERE m.id = message_id
    AND u.auth_user_id = auth.uid()
  )
);

-- RLS Policy: Users can insert files to conversations they participate in
CREATE POLICY "Users can upload encrypted files to their conversations"
ON encrypted_files FOR INSERT
WITH CHECK (
  -- Allow if user is uploading to a conversation they participate in
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
    JOIN users u ON cp.user_id = u.id
    WHERE m.id = message_id
    AND u.auth_user_id = auth.uid()
  )
  AND (
    -- created_by can be either auth user ID or internal user ID
    created_by = auth.uid()
    OR created_by IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  )
);

-- RLS Policy: Users can delete their own files
CREATE POLICY "Users can delete their own encrypted files"
ON encrypted_files FOR DELETE
USING (
  -- Allow if created_by matches auth user ID or their internal user ID
  created_by = auth.uid()
  OR created_by IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  )
);