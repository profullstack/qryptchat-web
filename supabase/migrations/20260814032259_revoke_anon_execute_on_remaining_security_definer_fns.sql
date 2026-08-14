-- Sweep of every remaining anon-executable SECURITY DEFINER function.
-- Context: docs/audits/2026-08-14-noir0x63-verification.md
--
-- 20260814030009 closed the six functions the audit named. This closes the
-- rest of the class: 41 further SECURITY DEFINER functions in `public` were
-- still executable by `anon`, i.e. by anyone holding the public anon key.
-- After this migration, zero SECURITY DEFINER functions in `public` are
-- reachable by `anon`.
--
-- Classification was made by tracing every `.rpc('<name>')` call site in src/
-- and identifying which Supabase client each one uses:
--
--   Group A - no application caller at all, or a caller that provably uses the
--             service-role client. Locked to service_role.
--   Group B - has a live caller that may run as `authenticated` (browser client
--             with a session, or the websocket client, which is the anon key
--             plus an Authorization bearer and therefore resolves to
--             `authenticated`). anon revoked, authenticated retained.
--
-- Both groups are applied via a loop over pg_proc rather than as literal
-- statements, so overloads are covered and a name that does not exist (or is
-- not SECURITY DEFINER) is skipped instead of erroring.
--
-- NOTE: revoking from PUBLIC alone is not sufficient; these carry an explicit
-- `anon=X/postgres` grant, so `anon` is named in every REVOKE.
--
-- Trigger functions are included. PostgreSQL checks EXECUTE on a trigger
-- function at CREATE TRIGGER time, not when the trigger fires, so revoking
-- here does not affect trigger execution.

-- --------------------------------------------------------------------------
-- Group A: locked to service_role.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    fn text;
    sig text;
    names text[] := ARRAY[
        'backfill_all_message_status','calculate_message_expiration',
        'check_message_status_coverage','check_sms_rate_limit',
        'cleanup_expired_messages','cleanup_sms_audit_logs','cleanup_sms_rate_limits',
        'fix_canonical_auth_user_ids','fix_missing_conversation_participants',
        'fn_create_message_status_entries','fn_get_user_message_content',
        'fn_messages_ready_for_gc','get_conversations_with_archive_data',
        'get_conversations_with_archive_support','get_sms_stats',
        'get_storage_bucket_limits','get_user_archived_conversations',
        'get_user_call_sessions','is_user_inactive','log_otp_verification_attempt',
        'log_sms_event','nuclear_delete_user_data','set_user_offline',
        'trigger_create_message_status','update_canonical_auth_user_ids',
        'update_message_has_files','bump_autoblog_integration'
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

-- --------------------------------------------------------------------------
-- Group B: anon revoked, authenticated + service_role retained.
--
-- Call sites:
--   archive_conversation / unarchive_conversation -> api/chat/conversations,
--       api/conversations/{archive,unarchive}
--   create_call_session / establish_call_session  -> websocket/handlers/ml-kem-voice-calls
--   find_user_by_unique_identifier                -> api/users/by-id/[identifier]
--   fn_cleanup_expired_messages                   -> lib/services/message-cleanup-service
--   fn_create_deliveries_for_message              -> api/chat/messages
--   fn_get_user_active_deliveries / fn_mark_read  -> lib/realtime/deliveries
--   fn_mark_message_read                          -> api/chat/messages
--   log_sms_notification                          -> lib/services/sms-notification-service
--   update_user_activity                          -> websocket/handlers/messages,
--       api/messages/{send,load}
--   get_user_public_key / upsert_user_public_key  -> api/crypto/public-keys,
--       api/keys/reset  (both service-role today, but kept available to
--       `authenticated` because breaking key exchange is the worst failure
--       mode here; upsert_user_public_key already enforces auth.uid()
--       internally, and get_user_public_key returns public keys by design)
-- --------------------------------------------------------------------------
DO $$
DECLARE
    fn text;
    sig text;
    names text[] := ARRAY[
        'archive_conversation','unarchive_conversation',
        'create_call_session','establish_call_session',
        'find_user_by_unique_identifier','fn_cleanup_expired_messages',
        'fn_create_deliveries_for_message','fn_get_user_active_deliveries',
        'fn_mark_message_read','fn_mark_read','log_sms_notification',
        'update_user_activity','get_user_public_key','upsert_user_public_key'
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

-- --------------------------------------------------------------------------
-- STILL OPEN after this migration (deliberately not fixed here):
--
-- Of the Group B functions, these take a user/conversation id as a parameter
-- and do NOT check it against auth.uid(), so an authenticated user can still
-- pass someone else's id:
--     archive_conversation, unarchive_conversation, find_user_by_unique_identifier,
--     fn_cleanup_expired_messages, fn_create_deliveries_for_message,
--     fn_get_user_active_deliveries, fn_mark_message_read, update_user_activity,
--     log_sms_notification
-- Closing those needs the same auth.uid() binding applied in 20260814030037,
-- which means rewriting nine bodies and re-testing each call path.
-- (create_call_session, establish_call_session, fn_mark_read and
--  upsert_user_public_key already bind to auth.uid().)
-- --------------------------------------------------------------------------
