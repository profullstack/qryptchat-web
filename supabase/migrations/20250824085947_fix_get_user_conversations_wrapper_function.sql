-- Fix get_user_conversations wrapper function to match BYTEA signature
-- The wrapper function was missing after the previous migration, causing type mismatch errors

-- Drop and recreate the get_user_conversations wrapper function with correct BYTEA signature
DROP FUNCTION IF EXISTS get_user_conversations(UUID);

CREATE OR REPLACE FUNCTION get_user_conversations(user_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    conversation_avatar_url TEXT,
    group_id UUID,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content BYTEA,  -- Ensure this matches the enhanced function
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    unread_count BIGINT
) 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
    -- Use the enhanced function which has the correct BYTEA signature
    RETURN QUERY SELECT * FROM get_user_conversations_enhanced(user_uuid);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_conversations(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_user_conversations(UUID) IS 'Wrapper function for get_user_conversations_enhanced with BYTEA encrypted_content';