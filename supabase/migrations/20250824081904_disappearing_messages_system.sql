-- Disappearing Messages System Migration
-- Implements server-authoritative disappearing messages with per-recipient lifecycle tracking
-- Uses Supabase Postgres + RLS + Realtime + Scheduled Edge Functions

-- Add disappearing message settings to conversation_participants
-- This allows per-participant timer configuration
ALTER TABLE conversation_participants 
ADD COLUMN IF NOT EXISTS disappear_seconds INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS start_on TEXT NOT NULL DEFAULT 'delivered' CHECK (start_on IN ('delivered', 'read'));

-- Create deliveries table for per-recipient message lifecycle tracking
CREATE TABLE IF NOT EXISTS public.deliveries (
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL,
    delivered_ts TIMESTAMPTZ,
    read_ts TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    deleted_ts TIMESTAMPTZ,
    deletion_reason TEXT,
    PRIMARY KEY (message_id, recipient_user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS deliveries_expires_idx ON public.deliveries(expires_at) WHERE deleted_ts IS NULL;
CREATE INDEX IF NOT EXISTS deliveries_recipient_idx ON public.deliveries(recipient_user_id);
CREATE INDEX IF NOT EXISTS deliveries_message_idx ON public.deliveries(message_id);

-- Update messages table to store encrypted content as bytea
-- Check if encrypted_content column exists and is text type, then alter it
DO $$
BEGIN
    -- Check if column exists and is text type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name = 'encrypted_content' 
        AND data_type = 'text'
        AND table_schema = 'public'
    ) THEN
        -- Convert text to bytea for proper encrypted storage
        ALTER TABLE messages ALTER COLUMN encrypted_content TYPE BYTEA USING encrypted_content::BYTEA;
        RAISE NOTICE 'Converted encrypted_content from text to bytea';
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name = 'encrypted_content'
        AND table_schema = 'public'
    ) THEN
        -- Add the column if it doesn't exist
        ALTER TABLE messages ADD COLUMN encrypted_content BYTEA NOT NULL DEFAULT ''::BYTEA;
        RAISE NOTICE 'Added encrypted_content column as bytea';
    END IF;
END $$;

-- Add content type and attachments support to messages if not exists
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN NOT NULL DEFAULT FALSE;

-- Create attachments table for encrypted file metadata
CREATE TABLE IF NOT EXISTS public.attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    enc_metadata JSONB NOT NULL,
    size INTEGER NOT NULL,
    server_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on new tables
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies for deliveries (recipients can read/update their own rows)
CREATE POLICY "deliveries_select_self" ON public.deliveries
    FOR SELECT USING (recipient_user_id::text = auth.uid()::text);

CREATE POLICY "deliveries_update_self" ON public.deliveries
    FOR UPDATE USING (recipient_user_id::text = auth.uid()::text)
    WITH CHECK (recipient_user_id::text = auth.uid()::text);

-- RLS policies for attachments (readable if you're in the message's conversation)
CREATE POLICY "attachments_select_if_participant" ON public.attachments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
            WHERE m.id = attachments.message_id 
            AND cp.user_id::text = auth.uid()::text 
            AND cp.left_at IS NULL
        )
    );

-- Function to create deliveries for a new message (fan-out)
CREATE OR REPLACE FUNCTION public.fn_create_deliveries_for_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id UUID;
    v_sender UUID;
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
            WHEN cp.disappear_seconds > 0 AND cp.start_on = 'delivered'
                THEN NOW() + MAKE_INTERVAL(secs => cp.disappear_seconds)
            ELSE NULL
        END
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = v_conversation_id
        AND cp.user_id != v_sender
        AND cp.left_at IS NULL;
END;
$$;

-- Function to mark message as read (compute read-based expiry if needed)
CREATE OR REPLACE FUNCTION public.fn_mark_read(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_seconds INTEGER;
    v_start_on TEXT;
    v_user_id UUID;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    
    -- Get participant settings for this user in this conversation
    SELECT cp.disappear_seconds, cp.start_on
    INTO v_seconds, v_start_on
    FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = p_message_id
        AND cp.user_id = v_user_id
        AND cp.left_at IS NULL;

    -- Update delivery record
    UPDATE public.deliveries d
    SET read_ts = NOW(),
        expires_at = CASE
            WHEN v_start_on = 'read' AND v_seconds > 0
                THEN NOW() + MAKE_INTERVAL(secs => v_seconds)
            ELSE d.expires_at
        END
    WHERE d.message_id = p_message_id
        AND d.recipient_user_id = v_user_id;
END;
$$;

-- Function to get messages ready for garbage collection
CREATE OR REPLACE FUNCTION public.fn_messages_ready_for_gc()
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT m.id
    FROM public.messages m
    WHERE NOT EXISTS (
        SELECT 1 FROM public.deliveries d
        WHERE d.message_id = m.id AND d.deleted_ts IS NULL
    );
$$;

-- Function to get user's active deliveries (for client filtering)
CREATE OR REPLACE FUNCTION public.fn_get_user_active_deliveries(p_user_id UUID)
RETURNS TABLE (
    message_id UUID,
    delivered_ts TIMESTAMPTZ,
    read_ts TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT 
        d.message_id,
        d.delivered_ts,
        d.read_ts,
        d.expires_at
    FROM public.deliveries d
    WHERE d.recipient_user_id = p_user_id
        AND d.deleted_ts IS NULL;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.fn_create_deliveries_for_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_user_active_deliveries(UUID) TO authenticated;

-- Grant service role permissions for garbage collection
GRANT EXECUTE ON FUNCTION public.fn_messages_ready_for_gc() TO service_role;

-- Add comments for documentation
COMMENT ON TABLE public.deliveries IS 'Per-recipient message delivery tracking for disappearing messages';
COMMENT ON COLUMN public.deliveries.expires_at IS 'When this delivery expires and should be tombstoned';
COMMENT ON COLUMN public.deliveries.deleted_ts IS 'When this delivery was tombstoned (null = active)';
COMMENT ON COLUMN public.deliveries.deletion_reason IS 'Why this delivery was deleted (expired, manual, etc.)';

COMMENT ON COLUMN public.conversation_participants.disappear_seconds IS 'Timer duration in seconds (0 = never disappear)';
COMMENT ON COLUMN public.conversation_participants.start_on IS 'When to start timer: delivered or read';

COMMENT ON FUNCTION public.fn_create_deliveries_for_message(UUID) IS 'Creates delivery records for all recipients of a message';
COMMENT ON FUNCTION public.fn_mark_read(UUID) IS 'Marks message as read and starts read-based timer if configured';
COMMENT ON FUNCTION public.fn_messages_ready_for_gc() IS 'Returns message IDs with no active deliveries (ready for cleanup)';