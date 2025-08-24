-- Force encrypted_content column conversion from TEXT to BYTEA
-- This migration ensures the column type is properly converted in production

-- First, check current column type and force conversion if needed
DO $$
DECLARE
    current_type text;
BEGIN
    -- Get the current data type of encrypted_content column
    SELECT data_type INTO current_type
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'encrypted_content';
    
    -- Log current type for debugging
    RAISE NOTICE 'Current encrypted_content column type: %', current_type;
    
    -- If it's still text, force conversion to bytea
    IF current_type = 'text' THEN
        RAISE NOTICE 'Converting encrypted_content from TEXT to BYTEA...';
        
        -- Convert the column type from TEXT to BYTEA
        -- This will convert text data to bytea using encode/decode
        ALTER TABLE messages 
        ALTER COLUMN encrypted_content TYPE bytea 
        USING encrypted_content::bytea;
        
        RAISE NOTICE 'Successfully converted encrypted_content to BYTEA';
    ELSE
        RAISE NOTICE 'encrypted_content is already type: %', current_type;
    END IF;
END $$;

-- Verify the conversion worked by checking the column type again
DO $$
DECLARE
    final_type text;
BEGIN
    SELECT data_type INTO final_type
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'encrypted_content';
    
    RAISE NOTICE 'Final encrypted_content column type: %', final_type;
    
    -- Ensure it's bytea
    IF final_type != 'bytea' THEN
        RAISE EXCEPTION 'Failed to convert encrypted_content to bytea. Current type: %', final_type;
    END IF;
END $$;