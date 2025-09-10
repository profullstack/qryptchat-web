-- Fix Encrypted Content Storage Migration
-- This fixes the issue where encrypted content was being stored as BYTEA instead of TEXT
-- causing corruption when converting back to JSON for client-side decryption

-- First, let's change the column type from BYTEA to TEXT
-- This will allow us to store Base64 strings directly without conversion
ALTER TABLE public.message_recipients 
ALTER COLUMN encrypted_content TYPE TEXT;

-- Update the fn_create_message_recipients function to store Base64 as TEXT instead of converting to BYTEA
CREATE OR REPLACE FUNCTION public.fn_create_message_recipients(
    p_message_id UUID,
    p_encrypted_contents JSONB -- { "user_id": "base64_encrypted_content", ... }
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_encrypted_content TEXT;
    v_conversation_id UUID;
    v_expires_at TIMESTAMP WITH TIME ZONE;
    v_start_on TEXT;
    v_disappear_seconds INTEGER;
BEGIN
    -- Get conversation ID for this message
    SELECT conversation_id INTO v_conversation_id
    FROM public.messages WHERE id = p_message_id;

    -- Iterate through each recipient and their encrypted content
    FOR v_user_id, v_encrypted_content IN
        SELECT key::UUID, value::TEXT
        FROM jsonb_each_text(p_encrypted_contents)
    LOOP
        -- Store Base64 content directly as TEXT (no conversion to BYTEA)
        -- The server already converts JSON -> Base64, so we just store it as-is
        
        -- Get user's disappearing message settings for this conversation
        SELECT 
            COALESCE(cp.disappear_seconds, 0),
            COALESCE(cp.start_on, 'delivered')
        INTO v_disappear_seconds, v_start_on
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = v_conversation_id
        AND cp.user_id = v_user_id
        AND cp.left_at IS NULL;

        -- Calculate expiration time if disappearing messages are enabled
        IF v_disappear_seconds > 0 THEN
            IF v_start_on = 'delivered' THEN
                v_expires_at := NOW() + (v_disappear_seconds || ' seconds')::INTERVAL;
            ELSE
                -- For 'read' start_on, expiration will be set when message is read
                v_expires_at := NULL;
            END IF;
        ELSE
            v_expires_at := NULL;
        END IF;
        
        -- Insert the recipient record with Base64 content stored as TEXT
        INSERT INTO public.message_recipients (
            message_id, 
            recipient_user_id, 
            encrypted_content,
            expires_at,
            start_on
        )
        VALUES (p_message_id, v_user_id, v_encrypted_content, v_expires_at, v_start_on)
        ON CONFLICT (message_id, recipient_user_id) 
        DO UPDATE SET 
            encrypted_content = EXCLUDED.encrypted_content,
            expires_at = EXCLUDED.expires_at,
            start_on = EXCLUDED.start_on;
    END LOOP;
END;
$$;

-- Convert existing BYTEA data back to Base64 TEXT format
-- This will fix any existing corrupted data in the database
UPDATE public.message_recipients 
SET encrypted_content = encode(encrypted_content::BYTEA, 'base64')
WHERE encrypted_content IS NOT NULL
AND encrypted_content != '';

-- Add a comment explaining the fix
COMMENT ON COLUMN public.message_recipients.encrypted_content IS 'Base64-encoded encrypted message content (stored as TEXT, not BYTEA to prevent corruption)';
COMMENT ON FUNCTION public.fn_create_message_recipients(UUID, JSONB) IS 'Creates encrypted message copies for all recipients - stores Base64 as TEXT to prevent corruption';

-- Grant necessary permissions (these should already exist, but ensuring they are set)
GRANT EXECUTE ON FUNCTION public.fn_create_message_recipients(UUID, JSONB) TO service_role;