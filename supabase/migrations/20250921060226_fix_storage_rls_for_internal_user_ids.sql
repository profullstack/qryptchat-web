-- Fix storage RLS policies to work with auth user IDs in storage paths
-- The issue is that storage paths use auth user IDs but policies may need adjusting

-- Drop existing storage policies for encrypted-files bucket
DROP POLICY IF EXISTS "Users can upload encrypted files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view encrypted files they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own encrypted files" ON storage.objects;

-- Storage policy: Users can upload files to paths that start with their auth user ID
CREATE POLICY "Users can upload encrypted files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'encrypted-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policy: Users can view files they have access to via conversation participation
CREATE POLICY "Users can view encrypted files they have access to"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'encrypted-files'
  AND (
    -- User can access files they uploaded (auth user ID matches first folder)
    auth.uid()::text = (storage.foldername(name))[1]
    OR
    -- User can access files from conversations they participate in
    EXISTS (
      SELECT 1 FROM encrypted_files ef
      JOIN messages m ON ef.message_id = m.id
      JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
      JOIN users u ON cp.user_id = u.id
      WHERE ef.storage_path = name
      AND u.auth_user_id = auth.uid()
    )
  )
);

-- Storage policy: Users can delete their own uploaded files
CREATE POLICY "Users can delete their own encrypted files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'encrypted-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);