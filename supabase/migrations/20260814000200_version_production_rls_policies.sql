-- Step 3 of the 2026-08 security remediation.
-- Context: docs/audits/2026-08-14-noir0x63-verification.md (QRY-01).
--
-- The July 2026 RLS fix was applied directly to production and never versioned.
-- Production currently has `users_select_authenticated` and
-- `messages_select_participant`; neither exists in any migration in this repo.
-- Meanwhile the committed migrations still create anon-readable
-- `USING (true)` SELECT policies on `users` and `messages`, so any fresh
-- deploy, branch database, or `supabase db reset` reintroduces the original
-- data leak.
--
-- This migration closes that gap in both directions: it drops the stale
-- permissive policies by name, and creates the production policies. It is
-- written to be a no-op against production and a real fix everywhere else.

-- --------------------------------------------------------------------------
-- Drop the permissive SELECT policies created by earlier migrations.
-- Each of these is `USING (true)` with no role restriction, i.e. readable by
-- `anon`. Named individually rather than dropped wholesale so that this stays
-- reviewable and does not silently remove a policy added later.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read user unique identifiers" ON public.users;
DROP POLICY IF EXISTS "Anyone can view user profiles"           ON public.users;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Users can read basic user info for search" ON public.users;

DROP POLICY IF EXISTS "Users can read all messages" ON public.messages;

-- --------------------------------------------------------------------------
-- Recreate the policies that production actually runs.
-- --------------------------------------------------------------------------

-- WARNING: `USING (true)` here is scoped to the `authenticated` role, not to
-- `anon` -- but it still lets any single logged-in account read every row of
-- `users`, which includes `phone_number`, `backup_pin_hash` and `salt`.
-- That is Step 4 of the remediation (narrow this to non-sensitive columns and
-- rehash PINs with Argon2id + the per-user salt) and is deliberately NOT
-- changed here, so that this migration reproduces production exactly.
-- See §2 of the verification document.
DROP POLICY IF EXISTS users_select_authenticated ON public.users;
CREATE POLICY users_select_authenticated ON public.users
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS messages_select_participant ON public.messages;
CREATE POLICY messages_select_participant ON public.messages
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.conversation_participants cp
            JOIN public.users u ON u.id = cp.user_id
            WHERE cp.conversation_id = messages.conversation_id
              AND u.auth_user_id = auth.uid()
        )
    );
