-- Remove mime_type and file_size columns from encrypted_files table
-- These values are now encrypted in the encrypted_metadata field for true E2E encryption

ALTER TABLE encrypted_files 
DROP COLUMN IF EXISTS mime_type,
DROP COLUMN IF EXISTS file_size;

-- Add comment to encrypted_metadata column
COMMENT ON COLUMN encrypted_files.encrypted_metadata IS 'E2E encrypted metadata containing filename, mimeType, size, etc. Encrypted client-side for each conversation participant.';