-- Comprehensive fix for large file upload limits (up to 2GB)
-- This migration addresses multiple potential bottlenecks in the file upload system

-- 1. Ensure encrypted-files bucket has 2GB limit
UPDATE storage.buckets
SET file_size_limit = 2147483648  -- 2GB in bytes
WHERE id = 'encrypted-files';

-- 2. Create encrypted-files bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('encrypted-files', 'encrypted-files', false, 2147483648, NULL)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 2147483648,
  allowed_mime_types = NULL;

-- 3. Ensure proper RLS policies for large file uploads
-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can upload files to encrypted-files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files in encrypted-files bucket" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files in encrypted-files bucket" ON storage.objects;

-- Create comprehensive RLS policies for encrypted-files bucket
CREATE POLICY "Users can upload files to encrypted-files bucket"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'encrypted-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own files in encrypted-files bucket"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'encrypted-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own files in encrypted-files bucket"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'encrypted-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. Update avatars bucket to also support larger files (100MB for high-res images)
UPDATE storage.buckets
SET file_size_limit = 104857600  -- 100MB in bytes
WHERE id = 'avatars';

-- 5. Create a function to check and report storage limits
CREATE OR REPLACE FUNCTION get_storage_bucket_limits()
RETURNS TABLE (
  bucket_id text,
  bucket_name text,
  file_size_limit_bytes bigint,
  file_size_limit_mb numeric,
  file_size_limit_gb numeric,
  is_public boolean
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    b.id,
    b.name,
    b.file_size_limit,
    ROUND(b.file_size_limit / 1048576.0, 2) as mb,
    ROUND(b.file_size_limit / 1073741824.0, 2) as gb,
    b.public
  FROM storage.buckets b
  ORDER BY b.file_size_limit DESC;
$$;

-- 6. Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_storage_bucket_limits() TO authenticated;

-- 7. Add helpful comments
COMMENT ON FUNCTION get_storage_bucket_limits() IS 'Returns storage bucket limits for debugging file upload issues';

-- 8. Log the changes
DO $$
BEGIN
  RAISE NOTICE 'Large file upload limits migration completed:';
  RAISE NOTICE '- encrypted-files bucket: 2GB limit';
  RAISE NOTICE '- avatars bucket: 100MB limit';
  RAISE NOTICE '- RLS policies updated for encrypted-files';
  RAISE NOTICE '- Added get_storage_bucket_limits() function for debugging';
END $$;