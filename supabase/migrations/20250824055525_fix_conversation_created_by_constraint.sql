-- Fix conversation created_by foreign key constraint issue
-- Make created_by nullable to allow conversations to be created by users who don't exist in the users table yet

-- Make created_by nullable in conversations table
ALTER TABLE conversations ALTER COLUMN created_by DROP NOT NULL;

-- Update the foreign key constraint to be deferrable (optional, for better performance)
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_created_by_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- Add a comment explaining the nullable created_by field
COMMENT ON COLUMN conversations.created_by IS 'User ID who created the conversation. Can be null if creator is not in users table yet.';