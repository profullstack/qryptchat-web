-- Hotfix: message sending was returning 500 for every user.
--
-- Postgres logged "permission denied for function calculate_message_expiration" on every
-- INSERT into public.messages. The BEFORE INSERT trigger `set_message_expiration` is the
-- only trigger on that table which is NOT SECURITY DEFINER, so its inner call ran with
-- the privileges of the invoking role. When #247 swept EXECUTE off the SECURITY DEFINER
-- functions, `authenticated` lost the grant that 20260203114500 had given it, the trigger
-- started raising, and the raise took the whole INSERT down with it.
--
-- Confirmed by the data: the newest row in `messages` was 2026-08-13, and #247 landed on
-- 2026-08-14. Nobody could send a message for three days.
--
-- The sibling trigger `trigger_create_message_status` already runs SECURITY DEFINER and
-- was unaffected for precisely this reason, so matching it fixes the break without
-- re-exposing `calculate_message_expiration` to client roles -- which is what a plain
-- GRANT back to `authenticated` would have done.
--
-- Lesson for the next sweep: revoking EXECUTE is not purely a lock-down. Any function
-- reachable from a non-DEFINER trigger is called with the writer's privileges, so a
-- revoke there is a write outage waiting to happen. Check pg_trigger before revoking.

CREATE OR REPLACE FUNCTION public.set_message_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    NEW.expires_at := public.calculate_message_expiration(NEW.conversation_id, NEW.sender_id);
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.set_message_expiration() IS
    'SECURITY DEFINER so the trigger can call calculate_message_expiration without granting client roles EXECUTE on it.';
