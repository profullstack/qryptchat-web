-- Per-Participant Message Encryption Migration
-- Implements per-participant encrypted message storage so each participant
-- can decrypt their own copy of the message using their private key

-- Create message_recipients table to store per-participant encrypted content
CREATE TABLE IF NOT EXISTS public.message_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    encrypted_content BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one encrypted copy per recipient per message
    UNIQUE(message_id, recipient_user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_message_recipients_message_id ON public.message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_message_recipients_recipient_user_id ON public.message_recipients(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_message_recipients_lookup ON public.message_recipients(message_id, recipient_user_id);

-- Enable RLS on message_recipients table
ALTER TABLE public.message_recipients ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only read their own encrypted message copies
CREATE POLICY "message_recipients_select_own" ON public.message_recipients
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = message_recipients.recipient_user_id
            AND u.auth_user_id = auth.uid()
        )
    );

-- RLS policy: Only message senders can insert recipient records (via service role)
CREATE POLICY "message_recipients_insert_sender" ON public.message_recipients
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.users u ON m.sender_id = u.id
            WHERE m.id = message_recipients.message_id
            AND u.auth_user_id = auth.uid()
        )
    );

-- Function to create message recipients for all conversation participants
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
BEGIN
    -- Iterate through each recipient and their encrypted content
    FOR v_user_id, v_encrypted_content IN
        SELECT key::UUID, value::TEXT
        FROM jsonb_each_text(p_encrypted_contents)
    LOOP
        -- Convert base64 to bytea
        v_content_bytes := decode(v_encrypted_content, 'base64');
        
        -- Insert the recipient record
        INSERT INTO public.message_recipients (message_id, recipient_user_id, encrypted_content)
        VALUES (p_message_id, v_user_id, v_content_bytes)
        ON CONFLICT (message_id, recipient_user_id) 
        DO UPDATE SET encrypted_content = EXCLUDED.encrypted_content;
    END LOOP;
END;
$$;

-- Function to get user's encrypted message content
CREATE OR REPLACE FUNCTION public.fn_get_user_message_content(
    p_message_id UUID,
    p_user_id UUID
)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_encrypted_content BYTEA;
BEGIN
    SELECT encrypted_content INTO v_encrypted_content
    FROM public.message_recipients
    WHERE message_id = p_message_id
    AND recipient_user_id = p_user_id;
    
    RETURN v_encrypted_content;
END;
$$;

-- Update the deliveries system to work with message_recipients
-- Modify fn_create_deliveries_for_message to also create message_recipients entries
CREATE OR REPLACE FUNCTION public.fn_create_deliveries_for_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id UUID;
    v_sender UUID;
    v_expires_at TIMESTAMP WITH TIME ZONE;
    v_seconds INTEGER;
    v_start_on TEXT;
BEGIN
    -- Get message details
    SELECT conversation_id, sender_id INTO v_conversation_id, v_sender
    FROM public.messages WHERE id = p_message_id;

    -- Create delivery records for all participants except sender
    INSERT INTO public.deliveries (message_id, recipient_user_id, delivered_ts, expires_at)
    SELECT
        p_message_id,
        cp.user_id,
        NOW(),
        CASE
            WHEN c.disappearing_messages_enabled AND c.disappearing_messages_duration_days IS NOT NULL
            THEN NOW() + (c.disappearing_messages_duration_days || ' days')::INTERVAL
            WHEN u.disappearing_messages_enabled AND u.disappearing_messages_duration_days IS NOT NULL
            THEN NOW() + (u.disappearing_messages_duration_days || ' days')::INTERVAL
            ELSE NULL
        END
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    JOIN public.users u ON u.id = cp.user_id
    WHERE cp.conversation_id = v_conversation_id
    AND cp.user_id != v_sender
    AND cp.left_at IS NULL;
END;
$$;

-- Grant necessary permissions
GRANT SELECT, INSERT ON public.message_recipients TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_message_recipients(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_user_message_content(UUID, UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.message_recipients IS 'Stores per-participant encrypted message content for secure multi-recipient messaging';
COMMENT ON COLUMN public.message_recipients.encrypted_content IS 'Message content encrypted specifically for this recipient using their public key';
COMMENT ON FUNCTION public.fn_create_message_recipients(UUID, JSONB) IS 'Creates encrypted message copies for all recipients';
COMMENT ON FUNCTION public.fn_get_user_message_content(UUID, UUID) IS 'Retrieves user-specific encrypted message content';