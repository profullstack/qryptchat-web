-- Remove original_filename column from encrypted_files table
-- This column is no longer needed as filename is now encrypted in the encrypted_metadata field

ALTER TABLE encrypted_files 
DROP COLUMN IF EXISTS original_filename;

-- Add comment to clarify the table structure
COMMENT ON TABLE encrypted_files IS 'Stores encrypted file metadata. All file information (filename, mimeType, size) is E2E encrypted in encrypted_metadata field.';