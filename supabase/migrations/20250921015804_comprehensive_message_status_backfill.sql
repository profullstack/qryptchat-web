-- Comprehensive Message Status Backfill
-- Fixes red dot issue by creating message_status entries for ALL existing messages
-- The problem: Old messages have no message_status entries, so they count as unread

-- Create function to backfill message_status entries for messages without them
CREATE OR REPLACE FUNCTION backfill_all_message_status()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_record RECORD;
    v_total_processed INTEGER := 0;
    v_batch_size INTEGER := 1000;
    v_current_batch INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting comprehensive message_status backfill...';
    
    -- Process messages in batches to avoid timeout
    FOR v_message_record IN
        SELECT DISTINCT m.id, m.conversation_id, m.sender_id, m.created_at
        FROM public.messages m
        LEFT JOIN public.message_status ms ON m.id = ms.message_id
        WHERE ms.message_id IS NULL  -- Messages with NO status entries
        AND m.created_at < NOW() - INTERVAL '1 minute'  -- Skip very recent messages (they should have triggers)
        ORDER BY m.created_at ASC  -- Process oldest first
    LOOP
        -- Create message_status entries for all participants except sender
        INSERT INTO public.message_status (message_id, user_id, status, timestamp)
        SELECT 
            v_message_record.id as message_id,
            cp.user_id,
            CASE 
                -- Mark messages older than 24 hours as 'read' (assume they've been seen)
                WHEN v_message_record.created_at < NOW() - INTERVAL '24 hours' THEN 'read'
                -- Mark recent messages as 'delivered' (unread)
                ELSE 'delivered'
            END as status,
            v_message_record.created_at as timestamp
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = v_message_record.conversation_id
        AND cp.user_id != v_message_record.sender_id  -- Don't create entries for sender
        AND cp.left_at IS NULL  -- Only active participants
        ON CONFLICT (message_id, user_id) DO NOTHING;  -- Skip if already exists
        
        v_total_processed := v_total_processed + 1;
        
        -- Progress reporting every 100 messages
        IF v_total_processed % 100 = 0 THEN
            RAISE NOTICE 'Processed % messages...', v_total_processed;
        END IF;
        
        -- Commit every 1000 messages to avoid long transactions
        IF v_total_processed % v_batch_size = 0 THEN
            v_current_batch := v_current_batch + 1;
            RAISE NOTICE 'Completed batch % (% messages total)', v_current_batch, v_total_processed;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Backfill complete! Processed % messages total', v_total_processed;
    RETURN v_total_processed;
END;
$$;

-- Run the backfill immediately
DO $$
DECLARE
    v_processed INTEGER;
    v_before_count INTEGER;
    v_after_count INTEGER;
BEGIN
    -- Count messages without status before
    SELECT COUNT(DISTINCT m.id) INTO v_before_count
    FROM public.messages m
    LEFT JOIN public.message_status ms ON m.id = ms.message_id
    WHERE ms.message_id IS NULL;
    
    RAISE NOTICE 'Found % messages without message_status entries', v_before_count;
    
    -- Run the backfill
    v_processed := backfill_all_message_status();
    
    -- Count messages without status after
    SELECT COUNT(DISTINCT m.id) INTO v_after_count
    FROM public.messages m
    LEFT JOIN public.message_status ms ON m.id = ms.message_id
    WHERE ms.message_id IS NULL;
    
    RAISE NOTICE 'BACKFILL SUMMARY:';
    RAISE NOTICE '  Messages without status BEFORE: %', v_before_count;
    RAISE NOTICE '  Messages processed: %', v_processed;
    RAISE NOTICE '  Messages without status AFTER: %', v_after_count;
    RAISE NOTICE '  Success: %', CASE WHEN v_after_count = 0 THEN 'ALL MESSAGES NOW HAVE STATUS!' ELSE 'Some messages still missing status' END;
END;
$$;

-- Add helpful query to check results
CREATE OR REPLACE FUNCTION check_message_status_coverage()
RETURNS TABLE (
    total_messages BIGINT,
    messages_with_status BIGINT,
    messages_without_status BIGINT,
    coverage_percentage DECIMAL
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        COUNT(m.id) as total_messages,
        COUNT(ms.message_id) as messages_with_status,
        COUNT(m.id) - COUNT(ms.message_id) as messages_without_status,
        ROUND(
            (COUNT(ms.message_id)::DECIMAL / COUNT(m.id)::DECIMAL) * 100, 2
        ) as coverage_percentage
    FROM public.messages m
    LEFT JOIN public.message_status ms ON m.id = ms.message_id;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION backfill_all_message_status() TO service_role;
GRANT EXECUTE ON FUNCTION check_message_status_coverage() TO authenticated;
GRANT EXECUTE ON FUNCTION check_message_status_coverage() TO service_role;

-- Add comments for documentation
COMMENT ON FUNCTION backfill_all_message_status() IS 'Backfills message_status entries for all messages that are missing them - fixes red dot issue';
COMMENT ON FUNCTION check_message_status_coverage() IS 'Returns statistics on message_status coverage to verify backfill success';

-- Show final statistics
SELECT 'FINAL STATISTICS:' as info;
SELECT * FROM check_message_status_coverage();