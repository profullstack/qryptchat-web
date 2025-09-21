-- Encrypted File Storage System
-- This migration sets up the infrastructure for client-side encrypted file uploads

-- Create storage bucket for encrypted files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'encrypted-files', 'encrypted-files', false, 52428800, ARRAY[
  'application/octet-stream', -- All encrypted files will be stored as binary
  'image/*',
  'video/*',
  'audio/*',
  'text/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'application/zip',
  'application/x-rar-compressed'
]
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'encrypted-files'
);

-- Create table for encrypted file metadata
CREATE TABLE IF NOT EXISTS encrypted_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL, -- Path in Supabase storage
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  encrypted_metadata JSONB NOT NULL, -- Client-side encrypted metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Indexes for performance
  CONSTRAINT encrypted_files_message_id_idx UNIQUE(message_id, id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS encrypted_files_message_id_idx ON encrypted_files(message_id);
CREATE INDEX IF NOT EXISTS encrypted_files_created_by_idx ON encrypted_files(created_by);
CREATE INDEX IF NOT EXISTS encrypted_files_created_at_idx ON encrypted_files(created_at);

-- Enable RLS on encrypted_files table
ALTER TABLE encrypted_files ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view encrypted files from their conversations" ON encrypted_files;
DROP POLICY IF EXISTS "Users can upload encrypted files to their conversations" ON encrypted_files;
DROP POLICY IF EXISTS "Users can delete their own encrypted files" ON encrypted_files;

-- RLS Policy: Users can only see files from conversations they participate in
CREATE POLICY "Users can view encrypted files from their conversations"
ON encrypted_files FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
    WHERE m.id = message_id
    AND cp.user_id = auth.uid()
  )
);

-- RLS Policy: Users can insert files to conversations they participate in
CREATE POLICY "Users can upload encrypted files to their conversations"
ON encrypted_files FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
    WHERE m.id = message_id
    AND cp.user_id = auth.uid()
  )
);

-- RLS Policy: Users can delete their own files
CREATE POLICY "Users can delete their own encrypted files"
ON encrypted_files FOR DELETE
USING (created_by = auth.uid());

-- Drop existing storage policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can upload encrypted files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view encrypted files they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own encrypted files" ON storage.objects;

-- Storage policies for encrypted-files bucket
-- Policy: Users can upload files to paths they own
CREATE POLICY "Users can upload encrypted files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'encrypted-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can view files from conversations they participate in
CREATE POLICY "Users can view encrypted files they have access to"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'encrypted-files'
  AND EXISTS (
    SELECT 1 FROM encrypted_files ef
    JOIN messages m ON ef.message_id = m.id
    JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
    WHERE ef.storage_path = name
    AND cp.user_id = auth.uid()
  )
);

-- Policy: Users can delete their own uploaded files
CREATE POLICY "Users can delete their own encrypted files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'encrypted-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add file attachment flag to messages table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'has_files'
  ) THEN
    ALTER TABLE messages ADD COLUMN has_files BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Create index on messages.has_files for performance
CREATE INDEX IF NOT EXISTS messages_has_files_idx ON messages(has_files) WHERE has_files = TRUE;

-- Function to automatically set has_files flag when file is attached
CREATE OR REPLACE FUNCTION update_message_has_files()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Set has_files to true when file is added
    UPDATE messages
    SET has_files = TRUE
    WHERE id = NEW.message_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Check if message still has files after deletion
    UPDATE messages
    SET has_files = EXISTS(
      SELECT 1 FROM encrypted_files
      WHERE message_id = OLD.message_id
    )
    WHERE id = OLD.message_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists and recreate it
DROP TRIGGER IF EXISTS update_message_has_files_trigger ON encrypted_files;

-- Create trigger to maintain has_files flag
CREATE TRIGGER update_message_has_files_trigger
  AFTER INSERT OR DELETE ON encrypted_files
  FOR EACH ROW
  EXECUTE FUNCTION update_message_has_files();

-- Grant necessary permissions
GRANT SELECT, INSERT, DELETE ON encrypted_files TO authenticated;