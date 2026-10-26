-- Re-lock the SECURITY DEFINER functions: their EXECUTE revokes were lost in the dev2 move.
--
-- 20260814030009, 20260814032259 and 20260814030037/032942 (#247) revoked EXECUTE on every
-- SECURITY DEFINER function in schema public from anon (and, for internal ones, from
-- authenticated) and bound the user-callable ones to auth.uid(). The bodies survived the
-- move to the self-hosted dev2 stack, but the ACLs did not (the restore did not carry
-- privileges), so on 2026-10-26 all 53 SECURITY DEFINER functions were executable by the
-- public anon key again.
--
-- That matters more than it looks, because the #247 bodies treat `auth.uid() IS NULL` as
-- "trusted server caller" (the service role has no uid). With anon allowed back in, anon
-- also has no uid, so every one of those checks waved anon through. The worst cases:
--   * upsert_user_public_key(target, key): `IF auth.uid() != target` is NULL for anon, so the
--     anon key could REPLACE ANY USER'S PUBLIC KEY (silent man-in-the-middle of E2EE).
--   * fn_get_user_message_content(msg, user): another user's encrypted message envelope.
--   * get_user_call_sessions / fn_get_user_active_deliveries / get_user_call_history /
--     get_user_active_calls: anyone's call sessions, deliveries and call history.
--   * get_conversations_with_archive_* / get_user_archived_conversations: anyone's
--     conversation list. get_sms_stats, log_sms_event, cleanup_*: internal.
--   * sync_user_with_auth / fix_* / update_canonical_auth_user_ids: rewrite identity rows.
--
-- Function BODIES are unchanged here (messaging behaviour stays identical). Only grants:
-- the same matrix #247 shipped, re-asserted idempotently, plus fn_cleanup_expired_messages
-- moved to service_role only (the app only calls it with the service role).
--
-- Also in this migration (rule: users must not write privileged columns of their own row):
--   * users.account_type and users.operator_user_id join the immutable list. An
--     'anonymous' account could PATCH itself to 'verified' and get the free daily phone
--     minutes that src/lib/server/phone.js withholds from anonymous accounts.
--   * blog_posts_bak_20261014 had RLS off and full anon/authenticated grants.
--   * key_access_log / sms_notifications INSERT policies `WITH CHECK (auth.uid() IS NULL)`
--     were meant for "the system" but matched anon; the service role bypasses RLS anyway,
--     so they now apply to service_role only.
--   * Default privileges: new functions are no longer executable by PUBLIC or anon.

-- 1. Internal / server-only: service_role only.
DO $$
DECLARE
    fn text;
    sig text;
    names text[] := ARRAY[
        'backfill_all_message_status','bump_autoblog_integration','calculate_message_expiration',
        'check_message_status_coverage','check_sms_rate_limit','cleanup_expired_messages',
        'cleanup_sms_audit_logs','cleanup_sms_rate_limits','delete_encrypted_data_only',
        'enforce_users_immutable_columns','fix_canonical_auth_user_ids',
        'fix_missing_conversation_participants','fn_cleanup_expired_messages',
        'fn_create_message_recipients','fn_create_message_status_entries',
        'fn_get_user_message_content','fn_messages_ready_for_gc',
        'get_conversations_with_archive_data','get_conversations_with_archive_support',
        'get_sms_stats','get_storage_bucket_limits','get_user_archived_conversations',
        'get_user_call_sessions','is_user_inactive','log_otp_verification_attempt',
        'log_sms_event','nuclear_delete_user_data','set_message_expiration','set_user_offline',
        'sync_user_with_auth','trigger_create_message_status','update_canonical_auth_user_ids',
        'update_message_has_files'
    ];
BEGIN
    FOREACH fn IN ARRAY names LOOP
        FOR sig IN
            SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = fn AND p.prosecdef
        LOOP
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
        END LOOP;
    END LOOP;
END $$;

-- 2. Signed-in users call these (browser, websocket handlers, user-session server
--    clients, RLS policies). Each scopes to auth.uid(); none may be called by anon.
DO $$
DECLARE
    fn text;
    sig text;
    names text[] := ARRAY[
        'archive_conversation','unarchive_conversation',
        'create_call_session','establish_call_session',
        'find_user_by_unique_identifier','fn_create_deliveries_for_message',
        'fn_get_user_active_deliveries','fn_mark_message_read','fn_mark_read',
        'log_sms_notification','update_user_activity','get_user_public_key',
        'upsert_user_public_key','get_inactive_participants','get_user_call_history',
        'get_user_active_calls','current_app_user_id','is_conversation_creator',
        'is_conversation_participant','shares_conversation_with'
    ];
BEGIN
    FOREACH fn IN ARRAY names LOOP
        FOR sig IN
            SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = fn AND p.prosecdef
        LOOP
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', sig);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', sig);
        END LOOP;
    END LOOP;
END $$;

-- 3. Any SECURITY DEFINER function in public not named above: lock it to service_role too,
--    so a function added later without a grant review is not left open by this list.
DO $$
DECLARE
    sig text;
BEGIN
    FOR sig IN
        SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END LOOP;
END $$;

-- 4. New functions: not executable by PUBLIC or anon unless granted on purpose.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- 5. users: account_type and operator_user_id are server-set, like the identity columns.
CREATE OR REPLACE FUNCTION public.enforce_users_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    IF current_setting('role', true) = 'service_role'
       OR auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.id                IS DISTINCT FROM OLD.id
       OR NEW.auth_user_id      IS DISTINCT FROM OLD.auth_user_id
       OR NEW.phone_number      IS DISTINCT FROM OLD.phone_number
       OR NEW.unique_identifier IS DISTINCT FROM OLD.unique_identifier
       OR NEW.created_at        IS DISTINCT FROM OLD.created_at
       OR NEW.salt              IS DISTINCT FROM OLD.salt
       OR NEW.account_type      IS DISTINCT FROM OLD.account_type
       OR NEW.operator_user_id  IS DISTINCT FROM OLD.operator_user_id
    THEN
        RAISE EXCEPTION
            'Identity columns of users are not client-writable (id, auth_user_id, phone_number, unique_identifier, created_at, salt, account_type, operator_user_id)';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_users_immutable_columns() FROM PUBLIC, anon, authenticated;

-- 6. Leftover backup table with RLS off.
ALTER TABLE IF EXISTS public.blog_posts_bak_20261014 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.blog_posts_bak_20261014 FROM anon, authenticated;

-- 7. "System" insert policies that matched anon.
DROP POLICY IF EXISTS "System can insert key access logs" ON public.key_access_log;
CREATE POLICY "System can insert key access logs" ON public.key_access_log
    FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert SMS notifications" ON public.sms_notifications;
CREATE POLICY "System can insert SMS notifications" ON public.sms_notifications
    FOR INSERT TO service_role WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
