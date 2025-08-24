-- Add Messages Reply-To Foreign Key Constraint (Idempotent)
-- Ensures the foreign key constraint exists for reply_to_id field in messages table
-- This enables proper message reply functionality

-- Check if constraint exists and add it only if it doesn't exist
DO $$
BEGIN
    -- Check if the constraint already exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'messages_reply_to_id_fkey'
        AND table_name = 'messages'
        AND table_schema = 'public'
    ) THEN
        -- Add foreign key constraint for reply_to_id field
        ALTER TABLE messages
        ADD CONSTRAINT messages_reply_to_id_fkey
        FOREIGN KEY (reply_to_id)
        REFERENCES messages(id)
        ON DELETE SET NULL;
        
        RAISE NOTICE 'Added foreign key constraint messages_reply_to_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key constraint messages_reply_to_id_fkey already exists';
    END IF;
END $$;

-- Add comment for documentation (this is idempotent)
COMMENT ON CONSTRAINT messages_reply_to_id_fkey ON messages IS 'Foreign key constraint allowing messages to reply to other messages';