-- Step 1 of the 2026-08 security remediation.
-- Context: docs/audits/2026-08-14-noir0x63-verification.md (QRY-02).
--
-- Every one of these functions is SECURITY DEFINER and was reachable by the
-- `anon` role, i.e. by anyone holding the public anon key. Earlier migrations
-- did `GRANT EXECUTE ... TO authenticated` but never revoked the default
-- PUBLIC grant.
--
-- NOTE: revoking from PUBLIC alone is NOT sufficient here. Production ACLs show
-- an *explicit* `anon=X/postgres` grant alongside the `=X/postgres` (PUBLIC)
-- entry, so `anon` must be named explicitly in each REVOKE.
--
-- `service_role` holds its own explicit grant (`service_role=X/postgres`) and is
-- unaffected by these revokes; it is re-granted below anyway for idempotence.

-- --------------------------------------------------------------------------
-- Only ever invoked with the service-role client, so lock them to service_role.
--   delete_encrypted_data_only  -> src/app/api/user/nuclear-delete/route.js
--   fn_create_message_recipients-> src/app/api/messages/send/route.js,
--                                  src/app/api/chat/messages/route.js,
--                                  src/lib/websocket/handlers/messages.js
-- Ownership for the delete path is already enforced in the API route, which
-- authenticates with getUser(), derives the internal id from auth_user_id, and
-- requires an explicit DELETE_ALL_MY_DATA confirmation.
-- --------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.delete_encrypted_data_only(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_encrypted_data_only(uuid, uuid)
    TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_create_message_recipients(uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_message_recipients(uuid, jsonb)
    TO service_role;

-- --------------------------------------------------------------------------
-- No application callers anywhere in src/.
-- --------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.sync_user_with_auth(text, uuid, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_with_auth(text, uuid, text, text)
    TO service_role;

-- --------------------------------------------------------------------------
-- These must remain callable by `authenticated`.
--   get_inactive_participants is called from the websocket send path, whose
--   client is the anon key plus an `Authorization: Bearer <access_token>`
--   header, so PostgREST resolves it to the `authenticated` role.
--   The two voice-call functions have no callers today but are kept available
--   to `authenticated` for the client that is expected to use them.
-- Per-row ownership is enforced in the next migration (20260814000100).
-- --------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_inactive_participants(uuid)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inactive_participants(uuid)
    TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_call_history(uuid, integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_call_history(uuid, integer)
    TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_active_calls(uuid)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_active_calls(uuid)
    TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- Dead code. The body is literally `RETURN TRUE;` and there are zero callers
-- in src/. It was a placeholder that never got implemented (QRY-07).
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_otp_valid_extended(text, text, integer);
