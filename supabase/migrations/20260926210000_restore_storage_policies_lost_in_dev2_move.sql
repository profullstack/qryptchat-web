-- Restore the RLS policies on storage.objects that the 2026-09-25 move to the
-- self-hosted Supabase stack on dev2 left behind.
--
-- The move dumped DDL for the app schemas only, and pg_dump files a policy
-- under its table's schema, so every policy ON storage.objects was dropped
-- while the buckets (copied as data) survived. With RLS on and no policy,
-- storage.objects denies everything to anon and authenticated: avatar
-- uploads and encrypted-file uploads/downloads fail for every user, and the
-- public avatars bucket only keeps working through the public URL path.
--
-- This is the final state after replaying every migration in order:
--   20250823223015_add_user_avatar_support.sql            4 avatar policies (singular names)
--   20250824005053_fix_avatar_storage_rls_policies.sql    4 avatar policies (plural names)
--   20250921060226_fix_storage_rls_for_internal_user_ids.sql  3 encrypted-files policies
--   20250926094631_fix_large_file_upload_limits.sql       3 encrypted-files bucket policies
-- The singular avatar policies were never dropped (the fix migration drops
-- the plural names only), so both sets existed on the cloud project.
--
-- Definitions are verbatim, except that the tables inside the encrypted-files
-- SELECT policy are schema-qualified (public.*), so the policy resolves the
-- same whatever search_path this is applied under.
--
-- The repo never created a trigger on auth.* or storage.* tables, so only
-- policies are restored here.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- avatars bucket, 20250823223015_add_user_avatar_support.sql
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects
FOR DELETE USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars" ON storage.objects
FOR SELECT USING (bucket_id = 'avatars');

-- ---------------------------------------------------------------------------
-- avatars bucket, 20250824005053_fix_avatar_storage_rls_policies.sql
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can view all avatars" ON storage.objects;
CREATE POLICY "Users can view all avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- encrypted-files bucket, 20250921060226_fix_storage_rls_for_internal_user_ids.sql
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can upload encrypted files" ON storage.objects;
CREATE POLICY "Users can upload encrypted files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'encrypted-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can view encrypted files they have access to" ON storage.objects;
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
      SELECT 1 FROM public.encrypted_files ef
      JOIN public.messages m ON ef.message_id = m.id
      JOIN public.conversation_participants cp ON m.conversation_id = cp.conversation_id
      JOIN public.users u ON cp.user_id = u.id
      WHERE ef.storage_path = name
      AND u.auth_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users can delete their own encrypted files" ON storage.objects;
CREATE POLICY "Users can delete their own encrypted files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'encrypted-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ---------------------------------------------------------------------------
-- encrypted-files bucket, 20250926094631_fix_large_file_upload_limits.sql
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can upload files to encrypted-files bucket" ON storage.objects;
CREATE POLICY "Users can upload files to encrypted-files bucket"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'encrypted-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can view their own files in encrypted-files bucket" ON storage.objects;
CREATE POLICY "Users can view their own files in encrypted-files bucket"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'encrypted-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete their own files in encrypted-files bucket" ON storage.objects;
CREATE POLICY "Users can delete their own files in encrypted-files bucket"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'encrypted-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
