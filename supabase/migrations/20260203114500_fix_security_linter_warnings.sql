-- Migration: Fix Security Linter Warnings
-- This migration fixes all function search_path warnings and RLS policy warnings
-- All functions are recreated with SET search_path = '' and fully qualified table names
-- Date: 2026-02-03

-- ============================================================================
-- PART 1: FIX RLS POLICIES (2 total)
-- ============================================================================

-- 1. Fix key_access_log policy "System can insert key access logs"
DROP POLICY IF EXISTS "System can insert key access logs" ON public.key_access_log;
CREATE POLICY "System can insert key access logs" ON public.key_access_log
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- 2. Fix sms_notifications policy "System can insert SMS notifications"
DROP POLICY IF EXISTS "System can insert SMS notifications" ON public.sms_notifications;
CREATE POLICY "System can insert SMS notifications" ON public.sms_notifications
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- ============================================================================
-- PART 2: FIX FUNCTIONS (68 total) - All with SET search_path = ''
-- ============================================================================

-- 1. update_encrypted_key_backups_updated_at
CREATE OR REPLACE FUNCTION public.update_encrypted_key_backups_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 2. update_user_public_keys_updated_at
CREATE OR REPLACE FUNCTION public.update_user_public_keys_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 3. find_user_by_unique_identifier
CREATE OR REPLACE FUNCTION public.find_user_by_unique_identifier(identifier TEXT)
RETURNS TABLE (
    id UUID,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    website TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.bio,
        u.website
    FROM public.users u
    WHERE u.unique_identifier = identifier;
END;
$$;

-- 4. get_user_public_key
CREATE OR REPLACE FUNCTION public.get_user_public_key(target_user_id UUID, key_type_param VARCHAR(50) DEFAULT 'ECDH-P256')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN (
        SELECT public_key 
        FROM public.user_public_keys 
        WHERE user_id = target_user_id 
        AND key_type = key_type_param
        LIMIT 1
    );
END;
$$;

-- 5. fix_canonical_auth_user_ids
CREATE OR REPLACE FUNCTION public.fix_canonical_auth_user_ids()
RETURNS TABLE(
    user_id UUID,
    old_auth_user_id UUID,
    new_auth_user_id UUID,
    email TEXT,
    phone_number TEXT,
    action TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id as user_id,
        u.auth_user_id as old_auth_user_id,
        au.id as new_auth_user_id,
        u.email,
        u.phone_number,
        CASE 
            WHEN u.auth_user_id = au.id THEN 'OK'
            WHEN u.auth_user_id != au.id THEN 'MISMATCH'
            ELSE 'UNKNOWN'
        END as action
    FROM public.users u
    LEFT JOIN auth.users au ON (
        (u.email IS NOT NULL AND au.email = u.email) OR
        (u.phone_number IS NOT NULL AND au.phone = u.phone_number)
    )
    WHERE au.id IS NOT NULL;
END;
$$;

-- 6. update_canonical_auth_user_ids
CREATE OR REPLACE FUNCTION public.update_canonical_auth_user_ids()
RETURNS TABLE(
    updated_user_id UUID,
    old_auth_user_id UUID,
    new_auth_user_id UUID,
    identifier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    WITH updates AS (
        UPDATE public.users u
        SET auth_user_id = au.id,
            updated_at = NOW()
        FROM auth.users au
        WHERE (
            (u.email IS NOT NULL AND au.email = u.email) OR
            (u.phone_number IS NOT NULL AND au.phone = u.phone_number)
        )
        AND u.auth_user_id != au.id
        RETURNING 
            u.id as user_id,
            u.auth_user_id as old_id,
            au.id as new_id,
            COALESCE(u.email, u.phone_number) as identifier
    )
    SELECT 
        updates.user_id,
        updates.old_id,
        updates.new_id,
        updates.identifier
    FROM updates;
END;
$$;

-- 7. get_user_conversations
DROP FUNCTION IF EXISTS public.get_user_conversations(UUID);
CREATE FUNCTION public.get_user_conversations(user_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    conversation_avatar_url TEXT,
    group_id UUID,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content BYTEA,
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    unread_count BIGINT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.get_user_conversations_enhanced(user_uuid);
END;
$$;

-- 8. upsert_user_public_key
CREATE OR REPLACE FUNCTION public.upsert_user_public_key(
    target_user_id UUID,
    public_key_param TEXT,
    key_type_param VARCHAR(50) DEFAULT 'ECDH-P256'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result_id UUID;
BEGIN
    IF auth.uid() != target_user_id THEN
        RAISE EXCEPTION 'Access denied: can only update own public key';
    END IF;

    INSERT INTO public.user_public_keys (user_id, public_key, key_type)
    VALUES (target_user_id, public_key_param, key_type_param)
    ON CONFLICT (user_id, key_type)
    DO UPDATE SET 
        public_key = EXCLUDED.public_key,
        updated_at = NOW()
    RETURNING id INTO result_id;
    
    RETURN result_id;
END;
$$;

-- 9. auto_add_conversation_creator
CREATE OR REPLACE FUNCTION public.auto_add_conversation_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE NOTICE 'auto_add_conversation_creator trigger fired for conversation_id: %, created_by: %', NEW.id, NEW.created_by;
    
    IF NEW.created_by IS NOT NULL THEN
        RAISE NOTICE 'Adding creator % as participant to conversation %', NEW.created_by, NEW.id;
        
        INSERT INTO public.conversation_participants (conversation_id, user_id, role, joined_at)
        VALUES (NEW.id, NEW.created_by, 'admin', NOW())
        ON CONFLICT (conversation_id, user_id) DO UPDATE SET
            role = EXCLUDED.role,
            joined_at = CASE 
                WHEN public.conversation_participants.left_at IS NOT NULL THEN EXCLUDED.joined_at
                ELSE public.conversation_participants.joined_at
            END,
            left_at = NULL;
        
        RAISE NOTICE 'Successfully added creator % as participant to conversation %', NEW.created_by, NEW.id;
    ELSE
        RAISE NOTICE 'WARNING: Conversation % has NULL created_by, skipping participant addition', NEW.id;
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'ERROR in auto_add_conversation_creator: % - %', SQLSTATE, SQLERRM;
        RAISE NOTICE 'Failed to add creator % as participant to conversation %', NEW.created_by, NEW.id;
        RETURN NEW;
END;
$$;

-- 10. fn_get_user_message_content
CREATE OR REPLACE FUNCTION public.fn_get_user_message_content(
    p_message_id UUID,
    p_user_id UUID
)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- 11. trigger_create_message_status
CREATE OR REPLACE FUNCTION public.trigger_create_message_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM public.fn_create_message_status_entries(NEW.id);
    RETURN NEW;
END;
$$;

-- 12. fn_create_message_recipients
CREATE OR REPLACE FUNCTION public.fn_create_message_recipients(
    p_message_id UUID,
    p_encrypted_contents JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_encrypted_content TEXT;
    v_conversation_id UUID;
    v_expires_at TIMESTAMP WITH TIME ZONE;
    v_start_on TEXT;
    v_disappear_seconds INTEGER;
BEGIN
    SELECT conversation_id INTO v_conversation_id
    FROM public.messages WHERE id = p_message_id;

    FOR v_user_id, v_encrypted_content IN
        SELECT key::UUID, value::TEXT
        FROM jsonb_each_text(p_encrypted_contents)
    LOOP
        SELECT 
            COALESCE(cp.disappear_seconds, 0),
            COALESCE(cp.start_on, 'delivered')
        INTO v_disappear_seconds, v_start_on
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = v_conversation_id
        AND cp.user_id = v_user_id
        AND cp.left_at IS NULL;

        IF v_disappear_seconds > 0 THEN
            IF v_start_on = 'delivered' THEN
                v_expires_at := NOW() + (v_disappear_seconds || ' seconds')::INTERVAL;
            ELSE
                v_expires_at := NULL;
            END IF;
        ELSE
            v_expires_at := NULL;
        END IF;
        
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

-- 13. fn_create_message_status_entries
CREATE OR REPLACE FUNCTION public.fn_create_message_status_entries(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_conversation_id UUID;
    v_sender_id UUID;
BEGIN
    SELECT conversation_id, sender_id INTO v_conversation_id, v_sender_id
    FROM public.messages WHERE id = p_message_id;
    
    IF v_conversation_id IS NULL THEN
        RAISE EXCEPTION 'Message not found: %', p_message_id;
    END IF;
    
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

-- 14. backfill_all_message_status
CREATE OR REPLACE FUNCTION public.backfill_all_message_status()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_message_record RECORD;
    v_total_processed INTEGER := 0;
    v_batch_size INTEGER := 1000;
    v_current_batch INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting comprehensive message_status backfill...';
    
    FOR v_message_record IN
        SELECT DISTINCT m.id, m.conversation_id, m.sender_id, m.created_at
        FROM public.messages m
        LEFT JOIN public.message_status ms ON m.id = ms.message_id
        WHERE ms.message_id IS NULL
        AND m.created_at < NOW() - INTERVAL '1 minute'
        ORDER BY m.created_at ASC
    LOOP
        INSERT INTO public.message_status (message_id, user_id, status, timestamp)
        SELECT 
            v_message_record.id as message_id,
            cp.user_id,
            CASE 
                WHEN v_message_record.created_at < NOW() - INTERVAL '24 hours' THEN 'read'
                ELSE 'delivered'
            END as status,
            v_message_record.created_at as timestamp
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = v_message_record.conversation_id
        AND cp.user_id != v_message_record.sender_id
        AND cp.left_at IS NULL
        ON CONFLICT (message_id, user_id) DO NOTHING;
        
        v_total_processed := v_total_processed + 1;
        
        IF v_total_processed % 100 = 0 THEN
            RAISE NOTICE 'Processed % messages...', v_total_processed;
        END IF;
        
        IF v_total_processed % v_batch_size = 0 THEN
            v_current_batch := v_current_batch + 1;
            RAISE NOTICE 'Completed batch % (% messages total)', v_current_batch, v_total_processed;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Backfill complete! Processed % messages total', v_total_processed;
    RETURN v_total_processed;
END;
$$;

-- 15. update_user_activity
CREATE OR REPLACE FUNCTION public.update_user_activity(user_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.users 
    SET 
        last_active_at = NOW(),
        is_online = TRUE
    WHERE id = user_uuid;
END;
$$;

-- 16. set_user_offline
CREATE OR REPLACE FUNCTION public.set_user_offline(user_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.users 
    SET is_online = FALSE
    WHERE id = user_uuid;
END;
$$;

-- 17. check_message_status_coverage
CREATE OR REPLACE FUNCTION public.check_message_status_coverage()
RETURNS TABLE (
    total_messages BIGINT,
    messages_with_status BIGINT,
    messages_without_status BIGINT,
    coverage_percentage DECIMAL
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT 
        COUNT(m.id) as total_messages,
        COUNT(ms.message_id) as messages_with_status,
        COUNT(m.id) - COUNT(ms.message_id) as messages_without_status,
        ROUND(
            (COUNT(ms.message_id)::DECIMAL / NULLIF(COUNT(m.id)::DECIMAL, 0)) * 100, 2
        ) as coverage_percentage
    FROM public.messages m
    LEFT JOIN public.message_status ms ON m.id = ms.message_id;
$$;

-- 18. generate_unique_identifier
CREATE OR REPLACE FUNCTION public.generate_unique_identifier()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    chars TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    result TEXT := '';
    i INTEGER;
    random_index INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        random_index := floor(random() * length(chars) + 1);
        result := result || substr(chars, random_index, 1);
    END LOOP;
    
    RETURN 'qryptchat' || result;
END;
$$;

-- 19. is_user_inactive
CREATE OR REPLACE FUNCTION public.is_user_inactive(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_record RECORD;
BEGIN
    SELECT last_active_at, is_online, sms_notifications_enabled
    INTO user_record
    FROM public.users 
    WHERE id = user_uuid;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    RETURN user_record.sms_notifications_enabled AND (
        NOT user_record.is_online OR 
        user_record.last_active_at < NOW() - INTERVAL '5 minutes'
    );
END;
$$;

-- 20. get_inactive_participants
CREATE OR REPLACE FUNCTION public.get_inactive_participants(conversation_uuid UUID)
RETURNS TABLE(
    user_id UUID,
    phone_number TEXT,
    display_name TEXT,
    username TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.phone_number,
        u.display_name,
        u.username
    FROM public.users u
    INNER JOIN public.conversation_participants cp ON u.id = cp.user_id
    WHERE cp.conversation_id = conversation_uuid
    AND cp.left_at IS NULL
    AND public.is_user_inactive(u.id) = TRUE
    AND u.phone_number IS NOT NULL;
END;
$$;

-- 21. log_sms_notification
CREATE OR REPLACE FUNCTION public.log_sms_notification(
    user_uuid UUID,
    conversation_uuid UUID,
    message_uuid UUID,
    phone TEXT,
    content TEXT,
    notification_status TEXT DEFAULT 'pending',
    error_msg TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO public.sms_notifications (
        user_id,
        conversation_id,
        message_id,
        phone_number,
        message_content,
        status,
        error_message
    ) VALUES (
        user_uuid,
        conversation_uuid,
        message_uuid,
        phone,
        content,
        notification_status,
        error_msg
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$;

-- 22. get_user_call_history
CREATE OR REPLACE FUNCTION public.get_user_call_history(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
    id TEXT,
    call_type TEXT,
    status TEXT,
    started_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    is_caller BOOLEAN,
    other_user_id UUID,
    other_user_username TEXT,
    other_user_display_name TEXT,
    other_user_avatar_url TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vc.id,
        vc.call_type,
        vc.status,
        vc.started_at,
        vc.connected_at,
        vc.ended_at,
        vc.duration_seconds,
        (vc.caller_id = p_user_id) as is_caller,
        CASE 
            WHEN vc.caller_id = p_user_id THEN vc.recipient_id
            ELSE vc.caller_id
        END as other_user_id,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.username
            ELSE caller_user.username
        END as other_user_username,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.display_name
            ELSE caller_user.display_name
        END as other_user_display_name,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.avatar_url
            ELSE caller_user.avatar_url
        END as other_user_avatar_url
    FROM public.voice_calls vc
    LEFT JOIN public.users caller_user ON vc.caller_id = caller_user.id
    LEFT JOIN public.users recipient_user ON vc.recipient_id = recipient_user.id
    WHERE vc.caller_id = p_user_id OR vc.recipient_id = p_user_id
    ORDER BY vc.started_at DESC
    LIMIT p_limit;
END;
$$;

-- 23. get_user_active_calls
CREATE OR REPLACE FUNCTION public.get_user_active_calls(p_user_id UUID)
RETURNS TABLE (
    id TEXT,
    call_type TEXT,
    status TEXT,
    started_at TIMESTAMPTZ,
    is_caller BOOLEAN,
    other_user_id UUID,
    other_user_username TEXT,
    other_user_display_name TEXT,
    other_user_avatar_url TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vc.id,
        vc.call_type,
        vc.status,
        vc.started_at,
        (vc.caller_id = p_user_id) as is_caller,
        CASE 
            WHEN vc.caller_id = p_user_id THEN vc.recipient_id
            ELSE vc.caller_id
        END as other_user_id,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.username
            ELSE caller_user.username
        END as other_user_username,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.display_name
            ELSE caller_user.display_name
        END as other_user_display_name,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.avatar_url
            ELSE caller_user.avatar_url
        END as other_user_avatar_url
    FROM public.voice_calls vc
    LEFT JOIN public.users caller_user ON vc.caller_id = caller_user.id
    LEFT JOIN public.users recipient_user ON vc.recipient_id = recipient_user.id
    WHERE (vc.caller_id = p_user_id OR vc.recipient_id = p_user_id)
    AND vc.status IN ('ringing', 'connected')
    ORDER BY vc.started_at DESC;
END;
$$;

-- 24. archive_conversation
CREATE OR REPLACE FUNCTION public.archive_conversation(
    conversation_uuid UUID,
    user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    internal_user_id UUID;
BEGIN
    SELECT id INTO internal_user_id
    FROM public.users 
    WHERE auth_user_id::text = user_uuid::text;
    
    IF internal_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    UPDATE public.conversation_participants 
    SET archived_at = NOW()
    WHERE conversation_id = conversation_uuid 
    AND user_id = internal_user_id 
    AND left_at IS NULL
    AND archived_at IS NULL;
    
    RETURN FOUND;
END;
$$;

-- 25. unarchive_conversation
CREATE OR REPLACE FUNCTION public.unarchive_conversation(
    conversation_uuid UUID,
    user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    internal_user_id UUID;
BEGIN
    SELECT id INTO internal_user_id
    FROM public.users 
    WHERE auth_user_id::text = user_uuid::text;
    
    IF internal_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    UPDATE public.conversation_participants 
    SET archived_at = NULL
    WHERE conversation_id = conversation_uuid 
    AND user_id = internal_user_id 
    AND left_at IS NULL
    AND archived_at IS NOT NULL;
    
    RETURN FOUND;
END;
$$;

-- 26. get_user_archived_conversations
CREATE OR REPLACE FUNCTION public.get_user_archived_conversations(user_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    conversation_avatar_url TEXT,
    group_id UUID,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content TEXT,
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    unread_count BIGINT,
    archived_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as conversation_id,
        c.type as conversation_type,
        CASE 
            WHEN c.type = 'direct' THEN 
                (SELECT u.display_name FROM public.users u 
                 JOIN public.conversation_participants cp2 ON u.id = cp2.user_id 
                 WHERE cp2.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            WHEN c.type = 'room' THEN c.name
            ELSE c.name
        END as conversation_name,
        CASE 
            WHEN c.type = 'direct' THEN 
                (SELECT u.avatar_url FROM public.users u 
                 JOIN public.conversation_participants cp3 ON u.id = cp3.user_id 
                 WHERE cp3.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            ELSE c.avatar_url
        END as conversation_avatar_url,
        c.group_id,
        g.name as group_name,
        (SELECT COUNT(*) FROM public.conversation_participants cp4 WHERE cp4.conversation_id = c.id) as participant_count,
        lm.id as latest_message_id,
        lm.encrypted_content::TEXT as latest_message_content,
        lm.sender_id as latest_message_sender_id,
        lu.username as latest_message_sender_username,
        lm.created_at as latest_message_created_at,
        (SELECT COUNT(*) FROM public.messages m 
         LEFT JOIN public.message_status ms ON m.id = ms.message_id AND ms.user_id = user_uuid
         WHERE m.conversation_id = c.id 
         AND m.sender_id != user_uuid 
         AND (ms.status IS NULL OR ms.status != 'read')
         AND m.deleted_at IS NULL) as unread_count,
        cp.archived_at
    FROM public.conversations c
    JOIN public.conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN public.groups g ON c.group_id = g.id
    LEFT JOIN LATERAL (
        SELECT m.* FROM public.messages m 
        WHERE m.conversation_id = c.id 
        AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC 
        LIMIT 1
    ) lm ON true
    LEFT JOIN public.users lu ON lm.sender_id = lu.id
    WHERE cp.user_id = user_uuid 
    AND cp.left_at IS NULL
    AND cp.archived_at IS NOT NULL
    ORDER BY cp.archived_at DESC;
END;
$$;

-- 27. prevent_note_to_self_archival
CREATE OR REPLACE FUNCTION public.prevent_note_to_self_archival()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = NEW.conversation_id 
            AND c.type = 'note_to_self'
        ) THEN
            RAISE EXCEPTION 'Cannot archive note-to-self conversations';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 28. prevent_note_to_self_deletion
CREATE OR REPLACE FUNCTION public.prevent_note_to_self_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.type = 'note_to_self' THEN
        RAISE EXCEPTION 'Cannot delete note-to-self conversations';
    END IF;

    RETURN OLD;
END;
$$;

-- 29. auto_create_note_to_self_conversation
CREATE OR REPLACE FUNCTION public.auto_create_note_to_self_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    new_conversation_id UUID;
BEGIN
    IF NEW.auth_user_id IS NOT NULL THEN
        INSERT INTO public.conversations (id, type, name, created_by, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'note_to_self',
            'Note to self',
            NEW.id,
            NOW(),
            NOW()
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO new_conversation_id;

        IF new_conversation_id IS NOT NULL THEN
            INSERT INTO public.conversation_participants (id, conversation_id, user_id, role, joined_at)
            VALUES (
                gen_random_uuid(),
                new_conversation_id,
                NEW.id,
                'admin',
                NOW()
            )
            ON CONFLICT (conversation_id, user_id) DO NOTHING;

            RAISE NOTICE 'Created note-to-self conversation % for user %', new_conversation_id, NEW.id;
        ELSE
            SELECT id INTO new_conversation_id 
            FROM public.conversations 
            WHERE created_by = NEW.id AND type = 'note_to_self' 
            LIMIT 1;
            
            IF new_conversation_id IS NOT NULL THEN
                INSERT INTO public.conversation_participants (id, conversation_id, user_id, role, joined_at)
                VALUES (
                    gen_random_uuid(),
                    new_conversation_id,
                    NEW.id,
                    'admin',
                    NOW()
                )
                ON CONFLICT (conversation_id, user_id) DO NOTHING;
                
                RAISE NOTICE 'Added participant to existing note-to-self conversation % for user %', new_conversation_id, NEW.id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 30. get_conversations_with_archive_support (was listed as get_conversations_with_archive_data)
CREATE OR REPLACE FUNCTION public.get_conversations_with_archive_support(
    user_uuid UUID,
    include_archived BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    conversation_avatar_url TEXT,
    group_id UUID,
    group_name TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content TEXT,
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    unread_count BIGINT,
    is_archived BOOLEAN,
    archived_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id as conversation_id,
        c.type as conversation_type,
        CASE
            WHEN c.type = 'direct' THEN
                (SELECT u.display_name FROM public.users u
                 JOIN public.conversation_participants cp2 ON u.id = cp2.user_id
                 WHERE cp2.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            WHEN c.type = 'room' THEN c.name
            ELSE c.name
        END as conversation_name,
        CASE
            WHEN c.type = 'direct' THEN
                (SELECT u.avatar_url FROM public.users u
                 JOIN public.conversation_participants cp3 ON u.id = cp3.user_id
                 WHERE cp3.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            ELSE c.avatar_url
        END as conversation_avatar_url,
        c.group_id,
        g.name as group_name,
        (SELECT COUNT(*) FROM public.conversation_participants cp4 WHERE cp4.conversation_id = c.id) as participant_count,
        lm.id as latest_message_id,
        lm.encrypted_content::TEXT as latest_message_content,
        lm.sender_id as latest_message_sender_id,
        lu.username as latest_message_sender_username,
        lm.created_at as latest_message_created_at,
        (SELECT COUNT(*) FROM public.messages m
         LEFT JOIN public.message_status ms ON m.id = ms.message_id AND ms.user_id = user_uuid
         WHERE m.conversation_id = c.id
         AND m.sender_id != user_uuid
         AND (ms.status IS NULL OR ms.status != 'read')
         AND m.deleted_at IS NULL) as unread_count,
        (cp.archived_at IS NOT NULL) as is_archived,
        cp.archived_at
    FROM public.conversations c
    JOIN public.conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN public.groups g ON c.group_id = g.id
    LEFT JOIN LATERAL (
        SELECT m.* FROM public.messages m
        WHERE m.conversation_id = c.id
        AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC
        LIMIT 1
    ) lm ON true
    LEFT JOIN public.users lu ON lm.sender_id = lu.id
    WHERE cp.user_id = user_uuid
    AND cp.left_at IS NULL
    AND (include_archived = TRUE OR cp.archived_at IS NULL)
    ORDER BY
        CASE WHEN cp.archived_at IS NOT NULL THEN 1 ELSE 0 END,
        COALESCE(lm.created_at, c.created_at) DESC;
END;
$$;

-- 31. get_user_conversations_enhanced
DROP FUNCTION IF EXISTS public.get_user_conversations_enhanced(uuid);
CREATE FUNCTION public.get_user_conversations_enhanced(user_uuid uuid)
RETURNS TABLE (
  conversation_id uuid,
  conversation_name text,
  conversation_type text,
  last_message_encrypted_content bytea,
  last_message_sender_username text,
  last_message_at timestamptz,
  unread_count bigint
)
LANGUAGE sql
SET search_path = ''
AS $$
  select
    c.id as conversation_id,
    c.name as conversation_name,
    c.type as conversation_type,
    m.encrypted_content as last_message_encrypted_content,
    u.username as last_message_sender_username,
    m.created_at as last_message_at,
    coalesce(
      (
        select count(*)
        from public.messages msg
        join public.deliveries d on d.message_id = msg.id
        where msg.conversation_id = c.id
          and d.recipient_user_id = user_uuid
          and d.read_ts is null
          and d.deleted_ts is null
      ),
      0
    ) as unread_count
  from public.conversations c
  join public.conversation_participants cp
    on cp.conversation_id = c.id and cp.user_id = user_uuid
  left join lateral (
    select ms.encrypted_content, ms.created_at, ms.sender_id
    from public.messages ms
    where ms.conversation_id = c.id
    order by ms.created_at desc
    limit 1
  ) m on true
  left join public.users u on u.id = m.sender_id
  order by m.created_at desc nulls last;
$$;

-- 32. get_storage_bucket_limits
CREATE OR REPLACE FUNCTION public.get_storage_bucket_limits()
RETURNS TABLE (
  bucket_id text,
  bucket_name text,
  file_size_limit_bytes bigint,
  file_size_limit_mb numeric,
  file_size_limit_gb numeric,
  is_public boolean
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    b.id,
    b.name,
    b.file_size_limit,
    ROUND(b.file_size_limit / 1048576.0, 2) as mb,
    ROUND(b.file_size_limit / 1073741824.0, 2) as gb,
    b.public
  FROM storage.buckets b
  ORDER BY b.file_size_limit DESC;
$$;

-- 33. fn_mark_message_read
CREATE OR REPLACE FUNCTION public.fn_mark_message_read(
    p_message_id UUID,
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_disappear_seconds INTEGER;
    v_start_on TEXT;
    v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
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

    IF v_disappear_seconds > 0 AND v_start_on = 'read' THEN
        v_expires_at := NOW() + (v_disappear_seconds || ' seconds')::INTERVAL;
    ELSE
        v_expires_at := NULL;
    END IF;

    UPDATE public.message_recipients 
    SET 
        read_at = NOW(),
        expires_at = COALESCE(expires_at, v_expires_at)
    WHERE message_id = p_message_id 
    AND recipient_user_id = p_user_id;

    UPDATE public.deliveries 
    SET read_ts = NOW()
    WHERE message_id = p_message_id 
    AND recipient_user_id = p_user_id;
END;
$$;

-- 34. ensure_unique_identifier
CREATE OR REPLACE FUNCTION public.ensure_unique_identifier()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    new_identifier TEXT;
    identifier_exists BOOLEAN;
BEGIN
    LOOP
        new_identifier := public.generate_unique_identifier();
        
        SELECT EXISTS(SELECT 1 FROM public.users WHERE unique_identifier = new_identifier) INTO identifier_exists;
        
        IF NOT identifier_exists THEN
            RETURN new_identifier;
        END IF;
    END LOOP;
END;
$$;

-- 35. auto_generate_unique_identifier
CREATE OR REPLACE FUNCTION public.auto_generate_unique_identifier()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.unique_identifier IS NULL THEN
        NEW.unique_identifier := public.ensure_unique_identifier();
    END IF;
    
    RETURN NEW;
END;
$$;

-- 36. fn_cleanup_expired_messages
CREATE OR REPLACE FUNCTION public.fn_cleanup_expired_messages(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_deleted_count INTEGER := 0;
BEGIN
    WITH deleted_recipients AS (
        DELETE FROM public.message_recipients
        WHERE (p_user_id IS NULL OR recipient_user_id = p_user_id)
        AND expires_at IS NOT NULL 
        AND expires_at <= NOW()
        RETURNING message_id, recipient_user_id
    )
    SELECT COUNT(*) INTO v_deleted_count FROM deleted_recipients;

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

-- 37. update_message_has_files
CREATE OR REPLACE FUNCTION public.update_message_has_files()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.messages 
    SET has_attachments = TRUE 
    WHERE id = NEW.message_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.messages 
    SET has_attachments = EXISTS(
      SELECT 1 FROM public.encrypted_files 
      WHERE message_id = OLD.message_id
    )
    WHERE id = OLD.message_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 38. validate_sms_template
CREATE OR REPLACE FUNCTION public.validate_sms_template(template_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF template_text LIKE '%{{ .Code }}%' THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

-- 39. get_sms_template
CREATE OR REPLACE FUNCTION public.get_sms_template(template_type_param TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    template_content TEXT;
BEGIN
    SELECT st.template_content INTO template_content
    FROM public.sms_templates st
    WHERE st.template_type = template_type_param
    AND st.is_active = TRUE
    LIMIT 1;
    
    RETURN COALESCE(template_content, 'Your verification code is {{ .Code }}');
END;
$$;

-- 40. create_call_session
CREATE OR REPLACE FUNCTION public.create_call_session(
    p_call_id TEXT,
    p_recipient_id UUID,
    p_ml_kem_parameter_set TEXT DEFAULT 'ML_KEM_1024',
    p_initiator_public_key TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session_id TEXT;
    v_initiator_id UUID;
BEGIN
    SELECT id INTO v_initiator_id 
    FROM public.users 
    WHERE auth_user_id = auth.uid();
    
    IF v_initiator_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    v_session_id := 'cs-' || extract(epoch from now()) || '-' || substr(md5(random()::text), 1, 8);
    
    INSERT INTO public.call_sessions (
        id,
        call_id,
        ml_kem_parameter_set,
        initiator_id,
        recipient_id,
        initiator_public_key,
        status
    ) VALUES (
        v_session_id,
        p_call_id,
        p_ml_kem_parameter_set,
        v_initiator_id,
        p_recipient_id,
        p_initiator_public_key,
        'pending'
    );
    
    RETURN v_session_id;
END;
$$;

-- 41. establish_call_session
CREATE OR REPLACE FUNCTION public.establish_call_session(
    p_session_id TEXT,
    p_recipient_public_key TEXT,
    p_ciphertext TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_session_record RECORD;
BEGIN
    SELECT id INTO v_user_id 
    FROM public.users 
    WHERE auth_user_id = auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    SELECT * INTO v_session_record
    FROM public.call_sessions
    WHERE id = p_session_id AND recipient_id = v_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Call session not found or access denied';
    END IF;
    
    UPDATE public.call_sessions
    SET 
        recipient_public_key = p_recipient_public_key,
        ciphertext = p_ciphertext,
        status = 'established',
        established_at = NOW()
    WHERE id = p_session_id;
    
    RETURN TRUE;
END;
$$;

-- 42. get_user_call_sessions
CREATE OR REPLACE FUNCTION public.get_user_call_sessions(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    session_id TEXT,
    call_id TEXT,
    ml_kem_parameter_set TEXT,
    is_initiator BOOLEAN,
    other_user_id UUID,
    other_user_username TEXT,
    other_user_display_name TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    established_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        SELECT id INTO v_user_id 
        FROM public.users 
        WHERE auth_user_id = auth.uid();
    ELSE
        v_user_id := p_user_id;
    END IF;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    RETURN QUERY
    SELECT 
        cs.id as session_id,
        cs.call_id,
        cs.ml_kem_parameter_set,
        (cs.initiator_id = v_user_id) as is_initiator,
        CASE 
            WHEN cs.initiator_id = v_user_id THEN cs.recipient_id
            ELSE cs.initiator_id
        END as other_user_id,
        CASE 
            WHEN cs.initiator_id = v_user_id THEN recipient_user.username
            ELSE initiator_user.username
        END as other_user_username,
        CASE 
            WHEN cs.initiator_id = v_user_id THEN recipient_user.display_name
            ELSE initiator_user.display_name
        END as other_user_display_name,
        cs.status,
        cs.created_at,
        cs.established_at
    FROM public.call_sessions cs
    LEFT JOIN public.users initiator_user ON cs.initiator_id = initiator_user.id
    LEFT JOIN public.users recipient_user ON cs.recipient_id = recipient_user.id
    WHERE cs.initiator_id = v_user_id OR cs.recipient_id = v_user_id
    ORDER BY cs.created_at DESC;
END;
$$;

-- 43. update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 44. create_direct_conversation
CREATE OR REPLACE FUNCTION public.create_direct_conversation(user1_id UUID, user2_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    conversation_id UUID;
    existing_conversation_id UUID;
BEGIN
    SELECT c.id INTO existing_conversation_id
    FROM public.conversations c
    JOIN public.conversation_participants cp1 ON c.id = cp1.conversation_id
    JOIN public.conversation_participants cp2 ON c.id = cp2.conversation_id
    WHERE c.type = 'direct'
    AND cp1.user_id = user1_id
    AND cp2.user_id = user2_id
    AND cp1.left_at IS NULL
    AND cp2.left_at IS NULL;

    IF existing_conversation_id IS NOT NULL THEN
        RETURN existing_conversation_id;
    END IF;

    INSERT INTO public.conversations (type, created_by)
    VALUES ('direct', user1_id)
    RETURNING id INTO conversation_id;

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES 
        (conversation_id, user1_id),
        (conversation_id, user2_id);

    RETURN conversation_id;
END;
$$;

-- 45. log_sms_event
CREATE OR REPLACE FUNCTION public.log_sms_event(
    p_phone_number TEXT,
    p_action TEXT,
    p_status TEXT,
    p_error_code TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_environment TEXT DEFAULT 'production',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO public.sms_audit_log (
        phone_number,
        action,
        status,
        error_code,
        error_message,
        user_agent,
        ip_address,
        environment,
        metadata
    ) VALUES (
        p_phone_number,
        p_action,
        p_status,
        p_error_code,
        p_error_message,
        p_user_agent,
        p_ip_address::INET,
        p_environment,
        p_metadata
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$;

-- 46. check_sms_rate_limit
CREATE OR REPLACE FUNCTION public.check_sms_rate_limit(p_phone_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    rate_limit_record RECORD;
    max_attempts INTEGER := 5;
    window_minutes INTEGER := 60;
    block_minutes INTEGER := 30;
    result JSONB;
BEGIN
    SELECT * INTO rate_limit_record
    FROM public.sms_rate_limits
    WHERE phone_number = p_phone_number;
    
    IF rate_limit_record IS NULL THEN
        INSERT INTO public.sms_rate_limits (phone_number, attempts, last_attempt)
        VALUES (p_phone_number, 1, NOW())
        RETURNING * INTO rate_limit_record;
        
        RETURN jsonb_build_object(
            'allowed', true,
            'attempts', 1,
            'max_attempts', max_attempts,
            'reset_at', NOW() + INTERVAL '1 hour'
        );
    END IF;
    
    IF rate_limit_record.blocked_until IS NOT NULL AND rate_limit_record.blocked_until > NOW() THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'rate_limited',
            'blocked_until', rate_limit_record.blocked_until,
            'attempts', rate_limit_record.attempts
        );
    END IF;
    
    IF rate_limit_record.last_attempt < NOW() - INTERVAL '1 hour' THEN
        UPDATE public.sms_rate_limits
        SET attempts = 1, last_attempt = NOW(), blocked_until = NULL
        WHERE phone_number = p_phone_number;
        
        RETURN jsonb_build_object(
            'allowed', true,
            'attempts', 1,
            'max_attempts', max_attempts,
            'reset_at', NOW() + INTERVAL '1 hour'
        );
    END IF;
    
    IF rate_limit_record.attempts >= max_attempts THEN
        UPDATE public.sms_rate_limits
        SET blocked_until = NOW() + (block_minutes || ' minutes')::INTERVAL
        WHERE phone_number = p_phone_number;
        
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'max_attempts_exceeded',
            'blocked_until', NOW() + (block_minutes || ' minutes')::INTERVAL,
            'attempts', rate_limit_record.attempts
        );
    END IF;
    
    UPDATE public.sms_rate_limits
    SET attempts = attempts + 1, last_attempt = NOW()
    WHERE phone_number = p_phone_number;
    
    RETURN jsonb_build_object(
        'allowed', true,
        'attempts', rate_limit_record.attempts + 1,
        'max_attempts', max_attempts,
        'reset_at', rate_limit_record.last_attempt + INTERVAL '1 hour'
    );
END;
$$;

-- 47. sync_user_with_auth
CREATE OR REPLACE FUNCTION public.sync_user_with_auth(
    p_phone_number TEXT,
    p_auth_user_id UUID,
    p_username TEXT DEFAULT NULL,
    p_display_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_id UUID;
    existing_user RECORD;
BEGIN
    SELECT * INTO existing_user
    FROM public.users
    WHERE phone_number = p_phone_number;
    
    IF existing_user IS NOT NULL THEN
        IF existing_user.auth_user_id IS NULL THEN
            UPDATE public.users
            SET auth_user_id = p_auth_user_id, updated_at = NOW()
            WHERE id = existing_user.id;
        END IF;
        
        RETURN existing_user.id;
    END IF;
    
    SELECT * INTO existing_user
    FROM public.users
    WHERE auth_user_id = p_auth_user_id;
    
    IF existing_user IS NOT NULL THEN
        IF existing_user.phone_number != p_phone_number THEN
            UPDATE public.users
            SET phone_number = p_phone_number, updated_at = NOW()
            WHERE id = existing_user.id;
        END IF;
        
        RETURN existing_user.id;
    END IF;
    
    IF p_username IS NOT NULL THEN
        INSERT INTO public.users (
            phone_number,
            auth_user_id,
            username,
            display_name,
            created_at,
            updated_at
        ) VALUES (
            p_phone_number,
            p_auth_user_id,
            p_username,
            COALESCE(p_display_name, p_username),
            NOW(),
            NOW()
        ) RETURNING id INTO user_id;
        
        RETURN user_id;
    END IF;
    
    RETURN NULL;
END;
$$;

-- 48. get_sms_stats
CREATE OR REPLACE FUNCTION public.get_sms_stats(
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_attempts', COUNT(*),
        'successful_sends', COUNT(*) FILTER (WHERE action = 'send_sms' AND status = 'success'),
        'failed_sends', COUNT(*) FILTER (WHERE action = 'send_sms' AND status = 'error'),
        'successful_verifications', COUNT(*) FILTER (WHERE action = 'verify_sms' AND status = 'success'),
        'failed_verifications', COUNT(*) FILTER (WHERE action = 'verify_sms' AND status = 'error'),
        'unique_phone_numbers', COUNT(DISTINCT phone_number),
        'period_start', p_start_date,
        'period_end', p_end_date
    ) INTO stats
    FROM public.sms_audit_log
    WHERE created_at BETWEEN p_start_date AND p_end_date;
    
    RETURN COALESCE(stats, '{}'::jsonb);
END;
$$;

-- 49. cleanup_sms_audit_logs
CREATE OR REPLACE FUNCTION public.cleanup_sms_audit_logs(
    p_retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.sms_audit_log
    WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 50. cleanup_sms_rate_limits
CREATE OR REPLACE FUNCTION public.cleanup_sms_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.sms_rate_limits
    WHERE last_attempt < NOW() - INTERVAL '24 hours'
    AND (blocked_until IS NULL OR blocked_until < NOW());
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 51. is_otp_valid_extended
CREATE OR REPLACE FUNCTION public.is_otp_valid_extended(
  phone_number TEXT,
  verification_code TEXT,
  extended_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  otp_created_at TIMESTAMPTZ;
  expiry_time TIMESTAMPTZ;
BEGIN
  expiry_time := NOW() - INTERVAL '1 minute' * extended_minutes;
  RETURN TRUE;
END;
$$;

-- 52. log_otp_verification_attempt
CREATE OR REPLACE FUNCTION public.log_otp_verification_attempt(
  phone_number TEXT,
  success BOOLEAN,
  error_type TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO auth.audit_log_entries (
    instance_id,
    id,
    payload,
    created_at,
    ip_address
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    gen_random_uuid(),
    jsonb_build_object(
      'action', 'sms_otp_verification',
      'phone_number', phone_number,
      'success', success,
      'error_type', error_type,
      'user_agent', user_agent,
      'timestamp', NOW()
    ),
    NOW(),
    '127.0.0.1'
  );
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

-- 53. get_otp_error_message
CREATE OR REPLACE FUNCTION public.get_otp_error_message(error_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  CASE error_code
    WHEN 'expired' THEN
      RETURN 'Your verification code has expired. Please request a new one.';
    WHEN 'invalid' THEN
      RETURN 'Invalid verification code. Please check and try again.';
    WHEN 'too_many_requests' THEN
      RETURN 'Too many attempts. Please wait before trying again.';
    ELSE
      RETURN 'Verification failed. Please try again or request a new code.';
  END CASE;
END;
$$;

-- 54. clean_sms_template
CREATE OR REPLACE FUNCTION public.clean_sms_template(template_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RETURN regexp_replace(template_text, '\{\{\s*\.Code\s*\}\}+', '{{ .Code }}', 'g');
END;
$$;

-- 55. allow_note_to_self_deletion_during_cleanup
CREATE OR REPLACE FUNCTION public.allow_note_to_self_deletion_during_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RETURN OLD;
END;
$$;

-- 56. generate_invite_code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    code TEXT;
    exists_flag BOOLEAN;
BEGIN
    LOOP
        code := upper(substring(md5(random()::text) from 1 for 8));
        
        SELECT EXISTS(SELECT 1 FROM public.groups WHERE invite_code = code) INTO exists_flag;
        
        IF NOT exists_flag THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN code;
END;
$$;

-- 57. join_group_by_invite
CREATE OR REPLACE FUNCTION public.join_group_by_invite(
    invite_code_param TEXT,
    user_id_param UUID
)
RETURNS TABLE (
    success BOOLEAN,
    group_id UUID,
    message TEXT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    target_group_id UUID;
    is_already_member BOOLEAN;
BEGIN
    SELECT id INTO target_group_id
    FROM public.groups 
    WHERE invite_code = invite_code_param;
    
    IF target_group_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Invalid invite code';
        RETURN;
    END IF;
    
    SELECT EXISTS(
        SELECT 1 FROM public.group_members 
        WHERE group_id = target_group_id 
        AND user_id = user_id_param 
        AND left_at IS NULL
    ) INTO is_already_member;
    
    IF is_already_member THEN
        RETURN QUERY SELECT FALSE, target_group_id, 'Already a member of this group';
        RETURN;
    END IF;
    
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (target_group_id, user_id_param, 'member')
    ON CONFLICT (group_id, user_id) 
    DO UPDATE SET left_at = NULL, joined_at = NOW();
    
    INSERT INTO public.conversation_participants (conversation_id, user_id, role)
    SELECT c.id, user_id_param, 'member'
    FROM public.conversations c
    WHERE c.group_id = target_group_id 
    AND c.type = 'room'
    AND c.is_private = FALSE
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    RETURN QUERY SELECT TRUE, target_group_id, 'Successfully joined group';
END;
$$;

-- 58. create_group_with_default_room
CREATE OR REPLACE FUNCTION public.create_group_with_default_room(
    group_name TEXT,
    creator_id UUID,
    group_description TEXT DEFAULT NULL,
    is_public_group BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    group_id UUID,
    room_id UUID,
    invite_code TEXT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    new_group_id UUID;
    new_room_id UUID;
    new_invite_code TEXT;
BEGIN
    new_invite_code := public.generate_invite_code();
    
    INSERT INTO public.groups (name, description, created_by, is_public, invite_code)
    VALUES (group_name, group_description, creator_id, is_public_group, new_invite_code)
    RETURNING id INTO new_group_id;
    
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (new_group_id, creator_id, 'owner');
    
    INSERT INTO public.conversations (type, name, group_id, created_by, position)
    VALUES ('room', 'general', new_group_id, creator_id, 0)
    RETURNING id INTO new_room_id;
    
    INSERT INTO public.conversation_participants (conversation_id, user_id, role)
    VALUES (new_room_id, creator_id, 'admin');
    
    RETURN QUERY SELECT new_group_id, new_room_id, new_invite_code;
END;
$$;

-- 59. get_user_groups
CREATE OR REPLACE FUNCTION public.get_user_groups(user_uuid UUID)
RETURNS TABLE (
    group_id UUID,
    group_name TEXT,
    group_description TEXT,
    group_avatar_url TEXT,
    user_role TEXT,
    room_count BIGINT,
    member_count BIGINT,
    latest_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        g.id as group_id,
        g.name as group_name,
        g.description as group_description,
        g.avatar_url as group_avatar_url,
        gm.role as user_role,
        (SELECT COUNT(*) FROM public.conversations WHERE public.conversations.group_id = g.id AND public.conversations.type = 'room') as room_count,
        (SELECT COUNT(*) FROM public.group_members WHERE public.group_members.group_id = g.id AND public.group_members.left_at IS NULL) as member_count,
        COALESCE(
            (SELECT MAX(m.created_at) 
             FROM public.messages m 
             JOIN public.conversations c ON m.conversation_id = c.id 
             WHERE c.group_id = g.id),
            g.created_at
        ) as latest_activity
    FROM public.groups g
    JOIN public.group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = user_uuid 
    AND gm.left_at IS NULL
    ORDER BY latest_activity DESC;
END;
$$;

-- 60. calculate_message_expiration
CREATE OR REPLACE FUNCTION public.calculate_message_expiration(
    conversation_id UUID,
    sender_id UUID
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    conv_duration INTEGER;
    user_default_duration INTEGER;
    expiration_days INTEGER;
BEGIN
    SELECT disappearing_messages_duration_days 
    INTO conv_duration
    FROM public.conversations 
    WHERE id = conversation_id AND disappearing_messages_enabled = TRUE;
    
    IF conv_duration IS NOT NULL THEN
        expiration_days := conv_duration;
    ELSE
        SELECT default_message_retention_days 
        INTO user_default_duration
        FROM public.users 
        WHERE id = sender_id;
        
        expiration_days := COALESCE(user_default_duration, 30);
    END IF;
    
    IF expiration_days = 0 THEN
        RETURN NULL;
    ELSE
        RETURN NOW() + (expiration_days || ' days')::INTERVAL;
    END IF;
END;
$$;

-- 61. set_message_expiration
CREATE OR REPLACE FUNCTION public.set_message_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.expires_at := public.calculate_message_expiration(NEW.conversation_id, NEW.sender_id);
    RETURN NEW;
END;
$$;

-- 62. cleanup_expired_messages
CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.messages 
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 63. fn_get_user_active_deliveries
CREATE OR REPLACE FUNCTION public.fn_get_user_active_deliveries(p_user_id UUID)
RETURNS TABLE (
    message_id UUID,
    delivered_ts TIMESTAMPTZ,
    read_ts TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
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

-- 64. fix_missing_conversation_participants
CREATE OR REPLACE FUNCTION public.fix_missing_conversation_participants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    conv_record RECORD;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'No authenticated user found';
    END IF;
    
    FOR conv_record IN 
        SELECT c.id, c.type, c.created_by
        FROM public.conversations c
        LEFT JOIN public.conversation_participants cp ON c.id = cp.conversation_id
        WHERE cp.conversation_id IS NULL
    LOOP
        INSERT INTO public.conversation_participants (
            conversation_id,
            user_id,
            role,
            joined_at
        ) VALUES (
            conv_record.id,
            current_user_id,
            'member',
            NOW()
        ) ON CONFLICT (conversation_id, user_id) DO NOTHING;
        
        IF conv_record.type = 'direct' AND conv_record.created_by IS NOT NULL AND conv_record.created_by != current_user_id THEN
            INSERT INTO public.conversation_participants (
                conversation_id,
                user_id,
                role,
                joined_at
            ) VALUES (
                conv_record.id,
                conv_record.created_by,
                'member',
                NOW()
            ) ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END IF;
    END LOOP;
END;
$$;

-- 65. fn_create_deliveries_for_message
CREATE OR REPLACE FUNCTION public.fn_create_deliveries_for_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_conversation_id UUID;
    v_sender UUID;
BEGIN
    SELECT conversation_id, sender_id INTO v_conversation_id, v_sender
    FROM public.messages WHERE id = p_message_id;

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

-- 66. fn_mark_read
CREATE OR REPLACE FUNCTION public.fn_mark_read(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_seconds INTEGER;
    v_start_on TEXT;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    SELECT cp.disappear_seconds, cp.start_on
    INTO v_seconds, v_start_on
    FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = p_message_id
        AND cp.user_id = v_user_id
        AND cp.left_at IS NULL;

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

-- 67. fn_messages_ready_for_gc
CREATE OR REPLACE FUNCTION public.fn_messages_ready_for_gc()
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT m.id
    FROM public.messages m
    WHERE NOT EXISTS (
        SELECT 1 FROM public.deliveries d
        WHERE d.message_id = m.id AND d.deleted_ts IS NULL
    );
$$;

-- 68. get_group_rooms
DROP FUNCTION IF EXISTS public.get_group_rooms(UUID, UUID);
CREATE FUNCTION public.get_group_rooms(group_uuid UUID, user_uuid UUID)
RETURNS TABLE (
    room_id UUID,
    room_name TEXT,
    room_description TEXT,
    is_private BOOLEAN,
    "position" INTEGER,
    unread_count BIGINT,
    latest_message_content BYTEA,
    latest_message_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as room_id,
        c.name as room_name,
        c.description as room_description,
        c.is_private,
        c.position,
        (SELECT COUNT(*) FROM public.messages m 
         LEFT JOIN public.message_status ms ON m.id = ms.message_id AND ms.user_id = user_uuid
         WHERE m.conversation_id = c.id 
         AND m.sender_id != user_uuid 
         AND (ms.status IS NULL OR ms.status != 'read')
         AND m.deleted_at IS NULL) as unread_count,
        lm.encrypted_content as latest_message_content,
        lm.created_at as latest_message_created_at
    FROM public.conversations c
    JOIN public.conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN LATERAL (
        SELECT m.encrypted_content, m.created_at 
        FROM public.messages m 
        WHERE m.conversation_id = c.id 
        AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC 
        LIMIT 1
    ) lm ON true
    WHERE c.group_id = group_uuid 
    AND c.type = 'room'
    AND cp.user_id = user_uuid 
    AND cp.left_at IS NULL
    ORDER BY c.position ASC, c.created_at ASC;
END;
$$;

-- ============================================================================
-- GRANT NECESSARY PERMISSIONS
-- ============================================================================

-- Grant permissions for all functions
GRANT EXECUTE ON FUNCTION public.update_encrypted_key_backups_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_public_keys_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_by_unique_identifier(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_public_key(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fix_canonical_auth_user_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_canonical_auth_user_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_conversations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_public_key(UUID, TEXT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_add_conversation_creator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_user_message_content(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_create_message_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_message_recipients(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_create_message_status_entries(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_message_status_entries(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_all_message_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_user_activity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_offline(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_message_status_coverage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_message_status_coverage() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_identifier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_inactive(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inactive_participants(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_sms_notification(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_call_history(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_active_calls(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_archived_conversations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_note_to_self_archival() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_note_to_self_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_create_note_to_self_conversation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversations_with_archive_support(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_conversations_enhanced(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_bucket_limits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_message_read(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_unique_identifier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_generate_unique_identifier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_expired_messages(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_expired_messages(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_message_has_files() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_sms_template(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sms_template(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_call_session(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.establish_call_session(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_call_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_sms_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_sms_rate_limit(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_with_auth(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sms_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_sms_audit_logs(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_sms_rate_limits() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_otp_valid_extended(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_otp_verification_attempt(TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_otp_error_message(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clean_sms_template(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allow_note_to_self_deletion_during_cleanup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group_by_invite(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_with_default_room(TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_groups(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_message_expiration(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_message_expiration() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_messages() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_user_active_deliveries(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fix_missing_conversation_participants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_deliveries_for_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_messages_ready_for_gc() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_group_rooms(UUID, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.update_encrypted_key_backups_updated_at() IS 'Trigger function to update updated_at timestamp - SET search_path = ''''';
COMMENT ON FUNCTION public.update_user_public_keys_updated_at() IS 'Trigger function to update updated_at timestamp - SET search_path = ''''';
COMMENT ON FUNCTION public.find_user_by_unique_identifier(TEXT) IS 'Find user by unique identifier - SET search_path = ''''';
COMMENT ON FUNCTION public.get_user_public_key(UUID, VARCHAR) IS 'Get user public key - SET search_path = ''''';
COMMENT ON FUNCTION public.fix_canonical_auth_user_ids() IS 'Fix canonical auth user IDs - SET search_path = ''''';
COMMENT ON FUNCTION public.update_canonical_auth_user_ids() IS 'Update canonical auth user IDs - SET search_path = ''''';
COMMENT ON FUNCTION public.get_user_conversations(UUID) IS 'Get user conversations - SET search_path = ''''';
COMMENT ON FUNCTION public.upsert_user_public_key(UUID, TEXT, VARCHAR) IS 'Upsert user public key - SET search_path = ''''';
COMMENT ON FUNCTION public.auto_add_conversation_creator() IS 'Auto add conversation creator - SET search_path = ''''';
COMMENT ON FUNCTION public.fn_get_user_message_content(UUID, UUID) IS 'Get user message content - SET search_path = ''''';

-- ============================================================================
-- DONE
-- ============================================================================

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '=== SECURITY LINTER FIX MIGRATION COMPLETED ===';
    RAISE NOTICE 'Fixed 68 functions with SET search_path = ''''';
    RAISE NOTICE 'Fixed 2 RLS policies with proper WITH CHECK restrictions';
END $$;
