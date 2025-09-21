-- Delete Encrypted Data Only Migration
-- This migration creates a function that deletes only encrypted data (messages, files)
-- while preserving the user account and profile information

-- Create the encrypted data delete function
CREATE OR REPLACE FUNCTION delete_encrypted_data_only(target_user_id UUID DEFAULT NULL, authenticated_user_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_counts JSON;
    temp_count INTEGER;
BEGIN
    -- Security check: ensure both user IDs are provided
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Target user ID is required';
    END IF;
    
    IF authenticated_user_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated user ID is required';
    END IF;
    
    -- Security check: users can only delete their own data
    IF target_user_id != authenticated_user_id THEN
        RAISE EXCEPTION 'Users can only delete their own data';
    END IF;
    
    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Delete encrypted data in proper order (respecting foreign keys)
    -- Focus only on encrypted/sensitive data, preserve account structure
    
    -- 1. Delete message recipients (encrypted content for user)
    DELETE FROM message_recipients WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := JSON_BUILD_OBJECT('message_recipients', temp_count);
    
    -- 2. Delete messages sent by user (encrypted content)
    DELETE FROM messages WHERE sender_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('messages', temp_count);
    
    -- 3. Delete encrypted files owned by user
    DELETE FROM encrypted_files WHERE uploaded_by = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('encrypted_files', temp_count);
    
    -- 4. Delete attachments owned by user
    DELETE FROM attachments WHERE uploaded_by = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('attachments', temp_count);
    
    -- 5. Delete encrypted key backups
    DELETE FROM encrypted_key_backups WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('encrypted_key_backups', temp_count);
    
    -- 6. Delete user public keys (encryption keys)
    DELETE FROM user_public_keys WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('user_public_keys', temp_count);
    
    -- 7. Delete key access log (encryption key access history)
    DELETE FROM key_access_log WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('key_access_log', temp_count);
    
    -- 8. Delete deliveries (message delivery tracking)
    DELETE FROM deliveries WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('deliveries', temp_count);
    
    -- 9. Delete message status (read receipts) 
    DELETE FROM message_status WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('message_status', temp_count);
    
    -- 10. Remove from conversation participants (leave conversations)
    DELETE FROM conversation_participants WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('conversation_participants', temp_count);
    
    -- 11. Delete conversations created by user if they have no other participants
    DELETE FROM conversations 
    WHERE created_by = target_user_id 
    AND NOT EXISTS (
        SELECT 1 FROM conversation_participants 
        WHERE conversation_id = conversations.id
    );
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('conversations', temp_count);
    
    -- NOTE: We preserve:
    -- - User account (users table)
    -- - User profile information
    -- - SMS notification preferences
    -- - Group memberships (but remove if they created groups with no other members)
    -- - Basic settings and preferences
    
    -- Return summary of what was deleted
    RETURN JSON_BUILD_OBJECT(
        'success', true,
        'user_id', target_user_id,
        'deleted_at', NOW(),
        'scope', 'encrypted_data_only',
        'preserved', 'User account and profile remain intact',
        'deleted_counts', deleted_counts
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Encrypted data delete failed: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_encrypted_data_only(UUID, UUID) TO authenticated;

-- Add comment explaining the function
COMMENT ON FUNCTION delete_encrypted_data_only(UUID, UUID) IS 'Deletes only encrypted data (messages, files, keys) while preserving user account and profile. Users can only delete their own data. Requires both target_user_id and authenticated_user_id for security validation.';