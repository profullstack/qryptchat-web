-- Wave 3 of the 2026-08 security remediation.
--
-- Two findings from the consolidated assessment (GHSA-3hqc-9v44-j37g) that were
-- still live in production:
--
--   V-007  Orphaned conversation hijacking. The UPDATE policy on `conversations`
--          began `(created_by IS NULL) AND (auth.uid() IS NOT NULL)`, so any
--          authenticated account could take over any conversation whose creator
--          column was NULL -- rename it, or claim it by setting created_by.
--   V-009  Mass assignment on `users`. `Users can update own profile` had a USING
--          clause and no WITH CHECK and no column restriction, so a user could
--          rewrite any column of their own row, including the identity-bearing
--          `phone_number` and `unique_identifier`.
--
-- Also drops four UPDATE policies that compare `auth.uid() = id`. That is the
-- identity domain drift recorded as IA-040: `auth.uid()` is the Supabase Auth
-- UUID while `users.id` is the internal key. Verified against production before
-- dropping -- 0 of 86 rows have `id = auth_user_id`, so these policies have never
-- matched a single row and grant nothing.

-- --------------------------------------------------------------------------
-- V-007: a conversation may only be updated by its creator.
--
-- `conversations_update_policy` compared `created_by::text = auth.uid()::text`,
-- which is the same domain drift as above and never matched either. Both are
-- replaced by one policy that resolves the caller properly, and which carries a
-- WITH CHECK so the new row cannot hand the conversation to someone else.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
DROP POLICY IF EXISTS conversations_update_policy          ON public.conversations;
DROP POLICY IF EXISTS conversations_update_creator         ON public.conversations;

CREATE POLICY conversations_update_creator ON public.conversations
    FOR UPDATE TO authenticated
    USING      (created_by = public.current_app_user_id())
    WITH CHECK (created_by = public.current_app_user_id());

-- --------------------------------------------------------------------------
-- V-009: pin the identity-bearing columns of `users`.
--
-- A column-level REVOKE was considered and rejected: it would have to enumerate
-- every writable column correctly, and any column added later defaults back to
-- writable. A trigger states the invariant directly and fails closed for columns
-- nobody thought about.
--
-- service_role is exempt because the legitimate writers of these columns are all
-- server-side and run as service_role: /api/auth/salt (salt),
-- /api/auth/verify-sms and the CoinPay callback (phone_number),
-- /api/auth/register-anon (unique_identifier).
--
-- The authenticated role legitimately writes only bio, website, updated_at and
-- sms_notifications_enabled, none of which are pinned here.
-- --------------------------------------------------------------------------
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

    IF NEW.id             IS DISTINCT FROM OLD.id
       OR NEW.auth_user_id   IS DISTINCT FROM OLD.auth_user_id
       OR NEW.phone_number   IS DISTINCT FROM OLD.phone_number
       OR NEW.unique_identifier IS DISTINCT FROM OLD.unique_identifier
       OR NEW.created_at     IS DISTINCT FROM OLD.created_at
       OR NEW.salt           IS DISTINCT FROM OLD.salt
    THEN
        RAISE EXCEPTION
            'Identity columns of users are not client-writable (id, auth_user_id, phone_number, unique_identifier, created_at, salt)';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS users_immutable_columns ON public.users;
CREATE TRIGGER users_immutable_columns
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_users_immutable_columns();

-- Give the surviving profile policy an explicit WITH CHECK so a row can never be
-- updated out from under its owner, independent of the trigger above.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE TO authenticated
    USING      (auth_user_id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid());

-- --------------------------------------------------------------------------
-- IA-040: drop the policies that can never match (auth.uid() = users.id).
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own avatar_url"                  ON public.users;
DROP POLICY IF EXISTS "Users can update their own disappearing messages settings" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile fields"              ON public.users;
DROP POLICY IF EXISTS "Users can read their own disappearing messages settings" ON public.users;

COMMENT ON FUNCTION public.enforce_users_immutable_columns() IS
    'Blocks client-side rewrites of identity columns on users (V-009). service_role is exempt.';
