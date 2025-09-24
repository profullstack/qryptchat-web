-- Remove deprecated original_filename column
-- Filenames are now encrypted within the file content JSON for better security

-- Step 1: Remove the original_filename column since filenames are now encrypted in file content
ALTER TABLE encrypted_files DROP COLUMN IF EXISTS original_filename;

-- Step 2: Update any remaining references or constraints
-- (No additional constraints needed since we're just removing the column)

-- Step 3: Add comment for documentation
COMMENT ON TABLE encrypted_files IS 'Encrypted file storage with filenames encrypted within file content JSON (no plaintext filenames)';

-- Step 4: Update the encrypted_metadata to reflect the new version
-- Files uploaded after this change will have version 3 (with embedded encrypted filenames)
-- This is already handled in the application code