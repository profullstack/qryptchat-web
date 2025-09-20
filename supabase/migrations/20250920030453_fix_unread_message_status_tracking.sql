-- Fix Unread Message Status Tracking
-- Ensures message_status entries are created for new messages so unread counts work properly
-- The system has two parallel tracking systems that need to be synchronized:
-- 1. Legacy message_status table (used for unread count calculation)
-- 2. New deliveries + message_recipients tables (used by newer message API)

-- Create function to initialize message_status entries for all conversation participants
-- This ensures the legacy unread count system works with new messages
CREATE OR REPLACE FUNCTION fn_create_message_status_entries(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id UUID;
    v_sender_id UUID;
BEGIN
    -- Get message details
    SELECT conversation_id, sender_id INTO v_conversation_id, v_sender_id
    FROM public.messages WHERE id = p_message_id;
    
    IF v_conversation_id IS NULL THEN
        RAISE EXCEPTION 'Message not found: %', p_message_id;
    END IF;
    
    -- Create message_status entries for all participants except sender
    -- Status 'delivered' means the message is unread (unread count logic: ms.status IS NULL OR ms.status != 'read')
    INSERT INTO public.message_status (message_id, user_id, status, timestamp)
    SELECT 
        p_message_id,
        cp.user_id,
        'delivered',
        NOW()
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = v_conversation_id
    AND cp.user_id != v_sender_id
    AND cp.left_at IS NULL
    ON CONFLICT (message_id, user_id) DO NOTHING;
    
END;
$$;

-- Create trigger function to automatically create message_status entries when messages are created
CREATE OR REPLACE FUNCTION trigger_create_message_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Call the function to create message_status entries
    PERFORM fn_create_message_status_entries(NEW.id);
    RETURN NEW;
END;
$$;

-- Create trigger on messages table to automatically create message_status entries
DROP TRIGGER IF EXISTS trigger_messages_create_status ON public.messages;
CREATE TRIGGER trigger_messages_create_status
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION trigger_create_message_status();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION fn_create_message_status_entries(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_create_message_status_entries(UUID) TO service_role;

-- Add comments for documentation
COMMENT ON FUNCTION fn_create_message_status_entries(UUID) IS 'Creates message_status entries for all conversation participants when a new message is created';
COMMENT ON FUNCTION trigger_create_message_status() IS 'Trigger function to automatically create message_status entries for new messages';
COMMENT ON TRIGGER trigger_messages_create_status ON public.messages IS 'Automatically creates message_status entries for conversation participants when messages are inserted';

-- Backfill existing messages that don't have message_status entries
-- This is a one-time operation to fix existing data
DO $$
DECLARE
    v_message_record RECORD;
    v_count INTEGER := 0;
BEGIN
    -- Find messages that don't have any message_status entries
    FOR v_message_record IN
        SELECT m.id
        FROM public.messages m
        LEFT JOIN public.message_status ms ON m.id = ms.message_id
        WHERE ms.message_id IS NULL
        AND m.created_at > NOW() - INTERVAL '30 days' -- Only backfill recent messages
        ORDER BY m.created_at DESC
        LIMIT 1000 -- Limit to prevent timeout
    LOOP
        -- Create message_status entries for this message
        PERFORM fn_create_message_status_entries(v_message_record.id);
        v_count := v_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Backfilled message_status entries for % messages', v_count;
END;
$$;