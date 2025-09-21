-- Force Replace Delete Function - Fix JSON Concatenation Issue
-- Drop all versions and create a clean working function

-- Drop all possible versions of the function
DROP FUNCTION IF EXISTS delete_encrypted_data_only(UUID);
DROP FUNCTION IF EXISTS delete_encrypted_data_only(UUID, UUID);
DROP FUNCTION IF EXISTS public.delete_encrypted_data_only(UUID);
DROP FUNCTION IF EXISTS public.delete_encrypted_data_only(UUID, UUID);

-- Create the working function with correct column names and no JSON concatenation
CREATE OR REPLACE FUNCTION delete_encrypted_data_only(authenticated_user_id UUID, target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    message_recipients_count INTEGER := 0;
    messages_count INTEGER := 0;
    encrypted_files_count INTEGER := 0;
    attachments_count INTEGER := 0;
    encrypted_key_backups_count INTEGER := 0;
    user_public_keys_count INTEGER := 0;
    key_access_log_count INTEGER := 0;
    deliveries_count INTEGER := 0;
    message_status_count INTEGER := 0;
    conversation_participants_count INTEGER := 0;
    conversations_count INTEGER := 0;
    voice_calls_count INTEGER := 0;
BEGIN
    -- Security check: ensure both user IDs are provided
    IF authenticated_user_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated user ID is required';
    END IF;
    
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Target user ID is required';
    END IF;
    
    -- Security check: users can only delete their own data
    IF target_user_id != authenticated_user_id THEN
        RAISE EXCEPTION 'Users can only delete their own data';
    END IF;
    
    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Delete encrypted data in proper order (respecting foreign keys)
    
    -- 1. Delete message recipients (encrypted content for user)
    DELETE FROM message_recipients WHERE recipient_user_id = target_user_id;
    GET DIAGNOSTICS message_recipients_count = ROW_COUNT;
    
    -- 2. Delete messages sent by user (encrypted content)
    DELETE FROM messages WHERE sender_id = target_user_id;
    GET DIAGNOSTICS messages_count = ROW_COUNT;
    
    -- 3. Delete encrypted files owned by user
    DELETE FROM encrypted_files WHERE uploaded_by = target_user_id;
    GET DIAGNOSTICS encrypted_files_count = ROW_COUNT;
    
    -- 4. Delete attachments owned by user  
    DELETE FROM attachments WHERE uploaded_by = target_user_id;
    GET DIAGNOSTICS attachments_count = ROW_COUNT;
    
    -- 5. Delete encrypted key backups
    DELETE FROM encrypted_key_backups WHERE user_id = target_user_id;
    GET DIAGNOSTICS encrypted_key_backups_count = ROW_COUNT;
    
    -- 6. Delete user public keys (encryption keys)
    DELETE FROM user_public_keys WHERE user_id = target_user_id;
    GET DIAGNOSTICS user_public_keys_count = ROW_COUNT;
    
    -- 7. Delete key access log (encryption key access history)
    DELETE FROM key_access_log WHERE user_id = target_user_id;
    GET DIAGNOSTICS key_access_log_count = ROW_COUNT;
    
    -- 8. Delete deliveries (message delivery tracking)
    DELETE FROM deliveries WHERE recipient_user_id = target_user_id;
    GET DIAGNOSTICS deliveries_count = ROW_COUNT;
    
    -- 9. Delete message status (read receipts) 
    DELETE FROM message_status WHERE user_id = target_user_id;
    GET DIAGNOSTICS message_status_count = ROW_COUNT;
    
    -- 10. Remove from conversation participants (leave conversations)
    DELETE FROM conversation_participants WHERE user_id = target_user_id;
    GET DIAGNOSTICS conversation_participants_count = ROW_COUNT;
    
    -- 11. Delete conversations created by user if they have no other participants
    DELETE FROM conversations 
    WHERE created_by = target_user_id 
    AND NOT EXISTS (
        SELECT 1 FROM conversation_participants 
        WHERE conversation_id = conversations.id
    );
    GET DIAGNOSTICS conversations_count = ROW_COUNT;
    
    -- 12. Delete voice calls where user is caller or callee
    DELETE FROM voice_calls WHERE caller_id = target_user_id OR callee_id = target_user_id;
    GET DIAGNOSTICS voice_calls_count = ROW_COUNT;
    
    -- Return summary using a single JSON_BUILD_OBJECT call (no concatenation)
    RETURN JSON_BUILD_OBJECT(
        'success', true,
        'authenticated_user_id', authenticated_user_id,
        'target_user_id', target_user_id,
        'deleted_at', NOW(),
        'scope', 'encrypted_data_only',
        'preserved', 'User account and profile remain intact',
        'deleted_counts', JSON_BUILD_OBJECT(
            'message_recipients', message_recipients_count,
            'messages', messages_count,
            'encrypted_files', encrypted_files_count,
            'attachments', attachments_count,
            'encrypted_key_backups', encrypted_key_backups_count,
            'user_public_keys', user_public_keys_count,
            'key_access_log', key_access_log_count,
            'deliveries', deliveries_count,
            'message_status', message_status_count,
            'conversation_participants', conversation_participants_count,
            'conversations', conversations_count,
            'voice_calls', voice_calls_count
        )
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Encrypted data delete failed: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_encrypted_data_only(UUID, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION delete_encrypted_data_only(UUID, UUID) IS 'Deletes encrypted data only. Uses recipient_user_id for message_recipients/deliveries. No JSON concatenation.';