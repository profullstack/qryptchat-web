-- Step 2 of the 2026-08 security remediation.
-- Context: docs/audits/2026-08-14-noir0x63-verification.md (QRY-03, QRY-04, NEW-02).
--
-- These SECURITY DEFINER functions took a user/conversation id as a parameter
-- and trusted it. Any caller who could execute them could read any other user's
-- call history, watch their active calls in real time, or dump the phone
-- numbers of an arbitrary conversation's inactive participants.
--
-- The guard added below binds the request to the session instead of to the
-- argument. `auth.uid() IS NOT NULL` lets service_role (which has no JWT, and
-- therefore a NULL auth.uid()) continue to call these; `anon` is revoked in
-- 20260814000000, so the only other caller is `authenticated`, which always
-- has a non-NULL auth.uid().
--
-- Bodies below are reproduced from the *live* production definitions, which had
-- drifted from this repo (they carry `SET search_path TO ''` and schema-
-- qualified references that the committed migrations do not). Only the guard is
-- new; the queries are unchanged.

-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_inactive_participants(conversation_uuid uuid)
 RETURNS TABLE(user_id uuid, phone_number text, display_name text, username text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Caller must be an active participant of the conversation being queried.
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.conversation_participants cp
        JOIN public.users u ON u.id = cp.user_id
        WHERE cp.conversation_id = conversation_uuid
          AND u.auth_user_id = auth.uid()
          AND cp.left_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Not authorized for this conversation';
    END IF;

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
$function$;

-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_active_calls(p_user_id uuid)
 RETURNS TABLE(id text, call_type text, status text, started_at timestamp with time zone, is_caller boolean, other_user_id uuid, other_user_username text, other_user_display_name text, other_user_avatar_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Caller may only read their own calls.
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = p_user_id AND u.auth_user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

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
$function$;

-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_call_history(p_user_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id text, call_type text, status text, started_at timestamp with time zone, connected_at timestamp with time zone, ended_at timestamp with time zone, duration_seconds integer, is_caller boolean, other_user_id uuid, other_user_username text, other_user_display_name text, other_user_avatar_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Caller may only read their own call history.
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = p_user_id AND u.auth_user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

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
$function$;

-- CREATE OR REPLACE preserves the existing ACL, so these are redundant when
-- 20260814000000 has already run. They are re-asserted anyway so this migration
-- is self-sufficient if the two are ever applied out of order, and because
-- REVOKE/GRANT are idempotent.
REVOKE EXECUTE ON FUNCTION public.get_inactive_participants(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_inactive_participants(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_active_calls(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_active_calls(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_call_history(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_call_history(uuid, integer) TO authenticated, service_role;
