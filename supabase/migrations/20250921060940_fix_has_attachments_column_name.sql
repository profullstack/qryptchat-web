-- Fix column name mismatch: has_files -> has_attachments
-- The messages API expects has_attachments but we created has_files

-- Add has_attachments column if it doesn't exist (the API expects this name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'has_attachments'
  ) THEN
    ALTER TABLE messages ADD COLUMN has_attachments BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Copy data from has_files to has_attachments if has_files exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'has_files'
  ) THEN
    UPDATE messages SET has_attachments = has_files WHERE has_files = TRUE;
  END IF;
END $$;

-- Drop has_files column if it exists (since we're standardizing on has_attachments)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'has_files'
  ) THEN
    ALTER TABLE messages DROP COLUMN has_files;
  END IF;
END $$;

-- Create index on messages.has_attachments for performance
CREATE INDEX IF NOT EXISTS messages_has_attachments_idx ON messages(has_attachments) WHERE has_attachments = TRUE;

-- Update function to use has_attachments instead of has_files
CREATE OR REPLACE FUNCTION update_message_has_files()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Set has_attachments to true when file is added
    UPDATE messages 
    SET has_attachments = TRUE 
    WHERE id = NEW.message_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Check if message still has files after deletion
    UPDATE messages 
    SET has_attachments = EXISTS(
      SELECT 1 FROM encrypted_files 
      WHERE message_id = OLD.message_id
    )
    WHERE id = OLD.message_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists with correct name
DROP TRIGGER IF EXISTS update_message_has_files_trigger ON encrypted_files;
CREATE TRIGGER update_message_has_files_trigger
  AFTER INSERT OR DELETE ON encrypted_files
  FOR EACH ROW
  EXECUTE FUNCTION update_message_has_files();