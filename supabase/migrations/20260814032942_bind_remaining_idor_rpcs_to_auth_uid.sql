-- Binds the remaining IDOR-able SECURITY DEFINER functions to auth.uid().
-- Context: docs/audits/2026-08-14-noir0x63-verification.md
--
-- 20260814032259 stopped `anon` reaching these, but they still trusted an id
-- passed as a parameter, so any *authenticated* user could act on another
-- user's rows. This binds each to the session instead.
--
-- The `auth.uid() IS NOT NULL AND ...` shape lets service_role (no JWT, so a
-- NULL auth.uid()) keep working; `anon` is already revoked, so the only other
-- caller is `authenticated`, which always has a non-NULL auth.uid().
--
-- Bodies are reproduced from the live definitions; only the guard is new.
--
-- Impact ranking of what this closes:
--   fn_mark_message_read              - marking another user's message read also
--                                       STARTS THEIR DISAPPEARING-MESSAGE TIMER,
--                                       so this destroyed data, not just state.
--   fn_get_user_active_deliveries     - read receipts / delivery + expiry
--                                       metadata for any user.
--   fn_create_deliveries_for_message  - fan out deliveries for someone else's
--                                       message.
--   archive_conversation /
--   unarchive_conversation            - archive state on another user's
--                                       conversation (user_uuid here is the
--                                       AUTH user id, hence the direct compare).
--   update_user_activity              - mark an arbitrary user online.
--
-- Also locks fn_cleanup_expired_messages to service_role: both callers
-- (lib/services/message-cleanup-service.js) already use the service-role
-- client, and with a NULL argument the function performs a GLOBAL GC pass.
--
-- DELIBERATELY NOT CHANGED:
--   find_user_by_unique_identifier - previously listed as an IDOR, which was
--     wrong. It returns only public profile columns (id, username,
--     display_name, avatar_url, bio, website) and is a lookup by design, gated
--     at api/users/by-id. No ownership relationship to enforce.
--   log_sms_notification - genuinely cross-user: the sender logs a
--     notification on behalf of the recipient, so an auth.uid() binding would
--     break it. The right fix is to pass the service-role client in
--     lib/websocket/handlers/messages.js (it already imports one) and then
--     lock the function down. That is a code change, not a migration, so it is
--     left open rather than half-done here.

CREATE OR REPLACE FUNCTION public.archive_conversation(conversation_uuid uuid, user_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    internal_user_id UUID;
BEGIN
    IF auth.uid() IS NOT NULL AND user_uuid <> auth.uid() THEN
        RETURN FALSE;
    END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.unarchive_conversation(conversation_uuid uuid, user_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    internal_user_id UUID;
BEGIN
    IF auth.uid() IS NOT NULL AND user_uuid <> auth.uid() THEN
        RETURN FALSE;
    END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.update_user_activity(user_uuid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = user_uuid AND u.auth_user_id = auth.uid()
    ) THEN
        RETURN;
    END IF;

    UPDATE public.users
    SET
        last_active_at = NOW(),
        is_online = TRUE
    WHERE id = user_uuid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_get_user_active_deliveries(p_user_id uuid)
 RETURNS TABLE(message_id uuid, delivered_ts timestamp with time zone, read_ts timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT
        d.message_id,
        d.delivered_ts,
        d.read_ts,
        d.expires_at
    FROM public.deliveries d
    WHERE d.recipient_user_id = p_user_id
        AND d.deleted_ts IS NULL
        AND (
            auth.uid() IS NULL
            OR EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = p_user_id AND u.auth_user_id = auth.uid()
            )
        );
$function$;

CREATE OR REPLACE FUNCTION public.fn_mark_message_read(p_message_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_disappear_seconds INTEGER;
    v_start_on TEXT;
    v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = p_user_id AND u.auth_user_id = auth.uid()
    ) THEN
        RETURN;
    END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.fn_create_deliveries_for_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_conversation_id UUID;
    v_sender UUID;
BEGIN
    SELECT conversation_id, sender_id INTO v_conversation_id, v_sender
    FROM public.messages WHERE id = p_message_id;

    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = v_sender AND u.auth_user_id = auth.uid()
    ) THEN
        RETURN;
    END IF;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cleanup_expired_messages(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_cleanup_expired_messages(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.archive_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.archive_conversation(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.unarchive_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unarchive_conversation(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_user_activity(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_user_activity(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_get_user_active_deliveries(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_get_user_active_deliveries(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_mark_message_read(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_mark_message_read(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_create_deliveries_for_message(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_create_deliveries_for_message(uuid) TO authenticated, service_role;
