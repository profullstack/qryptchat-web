-- Per-User Disappearing Messages Migration
-- Adds per-user expiration tracking to message_recipients table
-- Each user can have their own disappearing message settings

-- Add expiration columns to message_recipients table
ALTER TABLE public.message_recipients 
ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN start_on TEXT DEFAULT 'delivered' CHECK (start_on IN ('delivered', 'read')),
ADD COLUMN read_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_message_recipients_expires_at ON public.message_recipients(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_recipients_read_at ON public.message_recipients(read_at) WHERE read_at IS NOT NULL;

-- Update fn_create_message_recipients to set per-user expiration times
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
    v_content_bytes BYTEA;
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
        -- Convert base64 to bytea
        v_content_bytes := decode(v_encrypted_content, 'base64');
        
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
        
        -- Insert the recipient record with expiration info
        INSERT INTO public.message_recipients (
            message_id, 
            recipient_user_id, 
            encrypted_content,
            expires_at,
            start_on
        )
        VALUES (p_message_id, v_user_id, v_content_bytes, v_expires_at, v_start_on)
        ON CONFLICT (message_id, recipient_user_id) 
        DO UPDATE SET 
            encrypted_content = EXCLUDED.encrypted_content,
            expires_at = EXCLUDED.expires_at,
            start_on = EXCLUDED.start_on;
    END LOOP;
END;
$$;

-- Function to mark a message as read and start expiration timer if needed
CREATE OR REPLACE FUNCTION public.fn_mark_message_read(
    p_message_id UUID,
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_disappear_seconds INTEGER;
    v_start_on TEXT;
    v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get the recipient's settings
    SELECT 
        CASE 
            WHEN cp.disappear_seconds IS NOT NULL THEN cp.disappear_seconds
            ELSE 0
        END,
        COALESCE(mr.start_on, 'delivered')
    INTO v_disappear_seconds, v_start_on
    FROM public.message_recipients mr
    JOIN public.messages m ON m.id = mr.message_id
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = mr.recipient_user_id
    WHERE mr.message_id = p_message_id 
    AND mr.recipient_user_id = p_user_id
    AND cp.left_at IS NULL;

    -- Calculate expiration time if needed
    IF v_disappear_seconds > 0 AND v_start_on = 'read' THEN
        v_expires_at := NOW() + (v_disappear_seconds || ' seconds')::INTERVAL;
    ELSE
        v_expires_at := NULL;
    END IF;

    -- Update the message recipient with read timestamp and expiration
    UPDATE public.message_recipients 
    SET 
        read_at = NOW(),
        expires_at = COALESCE(expires_at, v_expires_at) -- Don't override existing expiration
    WHERE message_id = p_message_id 
    AND recipient_user_id = p_user_id;

    -- Also update the delivery record
    UPDATE public.deliveries 
    SET read_ts = NOW()
    WHERE message_id = p_message_id 
    AND recipient_user_id = p_user_id;
END;
$$;

-- Function to clean up expired messages for a specific user
CREATE OR REPLACE FUNCTION public.fn_cleanup_expired_messages(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER := 0;
BEGIN
    -- Delete expired message recipients
    WITH deleted_recipients AS (
        DELETE FROM public.message_recipients
        WHERE (p_user_id IS NULL OR recipient_user_id = p_user_id)
        AND expires_at IS NOT NULL 
        AND expires_at <= NOW()
        RETURNING message_id, recipient_user_id
    )
    SELECT COUNT(*) INTO v_deleted_count FROM deleted_recipients;

    -- Also mark corresponding deliveries as deleted
    UPDATE public.deliveries 
    SET deleted_ts = NOW()
    WHERE (p_user_id IS NULL OR recipient_user_id = p_user_id)
    AND deleted_ts IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM public.message_recipients mr 
        WHERE mr.message_id = deliveries.message_id 
        AND mr.recipient_user_id = deliveries.recipient_user_id
    );

    RETURN v_deleted_count;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.fn_mark_message_read(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_expired_messages(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_expired_messages(UUID) TO service_role;

-- Add comments for documentation
COMMENT ON COLUMN public.message_recipients.expires_at IS 'When this message copy expires for this specific user';
COMMENT ON COLUMN public.message_recipients.start_on IS 'When to start the disappearing timer: delivered or read';
COMMENT ON COLUMN public.message_recipients.read_at IS 'When this user read the message';
COMMENT ON FUNCTION public.fn_mark_message_read(UUID, UUID) IS 'Marks a message as read and starts expiration timer if needed';
COMMENT ON FUNCTION public.fn_cleanup_expired_messages(UUID) IS 'Removes expired message copies for a specific user or all users';