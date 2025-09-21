-- Nuclear Delete User Data Migration
-- This migration creates a function that allows users to completely delete all their data
-- Ensures users can only delete their own data through RLS and explicit checks

-- Create the nuclear delete function
CREATE OR REPLACE FUNCTION nuclear_delete_user_data(target_user_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID;
    deleted_counts JSON;
    temp_count INTEGER;
BEGIN
    -- Get the current authenticated user
    current_user_id := auth.uid();
    
    -- Security check: ensure user is authenticated
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to delete data';
    END IF;
    
    -- If no target specified, delete current user's data
    IF target_user_id IS NULL THEN
        target_user_id := current_user_id;
    END IF;
    
    -- Security check: users can only delete their own data
    IF target_user_id != current_user_id THEN
        RAISE EXCEPTION 'Users can only delete their own data';
    END IF;
    
    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Start transaction and delete data in proper order (respecting foreign keys)
    
    -- 1. Delete typing indicators
    DELETE FROM typing_indicators WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := JSON_BUILD_OBJECT('typing_indicators', temp_count);
    
    -- 2. Delete user presence
    DELETE FROM user_presence WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('user_presence', temp_count);
    
    -- 3. Delete voice call participants
    DELETE FROM voice_calls WHERE caller_id = target_user_id OR callee_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('voice_calls', temp_count);
    
    -- 4. Delete message status (read receipts)
    DELETE FROM message_status WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('message_status', temp_count);
    
    -- 5. Delete message recipients (encrypted content for user)
    DELETE FROM message_recipients WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('message_recipients', temp_count);
    
    -- 6. Delete deliveries
    DELETE FROM deliveries WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('deliveries', temp_count);
    
    -- 7. Delete attachments owned by user
    DELETE FROM attachments WHERE uploaded_by = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('attachments', temp_count);
    
    -- 8. Delete encrypted files owned by user
    DELETE FROM encrypted_files WHERE uploaded_by = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('encrypted_files', temp_count);
    
    -- 9. Delete messages sent by user
    DELETE FROM messages WHERE sender_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('messages', temp_count);
    
    -- 10. Delete conversation participants (remove user from all conversations)
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
    
    -- 12. Delete group memberships
    DELETE FROM group_members WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('group_members', temp_count);
    
    -- 13. Delete groups created by user if they have no other members
    DELETE FROM groups 
    WHERE created_by = target_user_id 
    AND NOT EXISTS (
        SELECT 1 FROM group_members 
        WHERE group_id = groups.id
    );
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('groups', temp_count);
    
    -- 14. Delete SMS notifications
    DELETE FROM sms_notifications WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('sms_notifications', temp_count);
    
    -- 15. Delete SMS audit log entries
    DELETE FROM sms_audit_log WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('sms_audit_log', temp_count);
    
    -- 16. Delete SMS rate limits
    DELETE FROM sms_rate_limits WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('sms_rate_limits', temp_count);
    
    -- 17. Delete phone verification history
    DELETE FROM phone_verifications WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('phone_verifications', temp_count);
    
    -- 18. Delete encrypted key backups
    DELETE FROM encrypted_key_backups WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('encrypted_key_backups', temp_count);
    
    -- 19. Delete key access log
    DELETE FROM key_access_log WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('key_access_log', temp_count);
    
    -- 20. Delete user public keys
    DELETE FROM user_public_keys WHERE user_id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('user_public_keys', temp_count);
    
    -- 21. Finally, delete the user record itself (this will trigger CASCADE deletes for any remaining data)
    DELETE FROM users WHERE id = target_user_id;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_counts := deleted_counts || JSON_BUILD_OBJECT('users', temp_count);
    
    -- Return summary of what was deleted
    RETURN JSON_BUILD_OBJECT(
        'success', true,
        'user_id', target_user_id,
        'deleted_at', NOW(),
        'deleted_counts', deleted_counts
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE EXCEPTION 'Nuclear delete failed: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION nuclear_delete_user_data(UUID) TO authenticated;

-- Add RLS policy to ensure function can only be called by authenticated users
-- (The function itself has additional security checks)
COMMENT ON FUNCTION nuclear_delete_user_data(UUID) IS 'Nuclear delete function that completely removes all user data. Users can only delete their own data.';