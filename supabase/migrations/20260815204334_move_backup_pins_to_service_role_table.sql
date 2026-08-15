-- Step 4 of the 2026-08 security remediation.
-- Context: docs/audits/2026-08-14-noir0x63-verification.md (§2, NEW-04)
-- Advisory: GHSA-jpfm-vrpc-p6rr
--
-- Two problems, one chain:
--
--   1. `users_select_authenticated` is `USING (true)` for the `authenticated`
--      role, so any single logged-in account can read every row of
--      `public.users` -- including `backup_pin_hash`.
--   2. Those hashes were plain unsalted SHA-256 of a 6-12 digit PIN, which a
--      precomputed table recovers instantly.
--
-- Chained, one throwaway signup recovered every user's backup PIN.
--
-- Narrowing the RLS policy alone does not fix this: the app legitimately reads
-- other users' rows (search, participant lookup) and several callers do
-- `select('*')`, which a column-level REVOKE would break outright. So the
-- credential column is moved out of `users` entirely, into a table that the
-- `anon` and `authenticated` roles have no privileges on at all. Only the
-- service role -- i.e. server-side route handlers -- can reach it.
--
-- The PIN hash itself is never verified server-side; it only ever backed the
-- `hasPin` boolean returned by GET /api/auth/backup-pin. The PIN's real job is
-- client-side key-backup derivation. So the existing unsalted digests are NOT
-- carried across: row existence preserves `hasPin`, and the weak hashes are
-- discarded rather than relocated. Setting a new PIN writes a salted scrypt
-- hash (see src/app/api/auth/backup-pin/route.js).

-- --------------------------------------------------------------------------
-- Service-role-only home for backup PIN material.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_backup_pins (
    user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    pin_hash   text,
    pin_salt   text,
    algorithm  text        NOT NULL DEFAULT 'legacy-sha256-discarded',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_backup_pins IS
    'Backup PIN material. Service role only -- anon and authenticated hold no '
    'privileges and there are deliberately no RLS policies. See GHSA-jpfm-vrpc-p6rr.';
COMMENT ON COLUMN public.user_backup_pins.algorithm IS
    'scrypt-n16384-r8-p1 for PINs set after 2026-08-15. '
    'legacy-sha256-discarded marks a pre-migration PIN whose weak unsalted '
    'digest was destroyed; pin_hash/pin_salt are NULL and the row exists only '
    'so that hasPin stays true until the user sets a new PIN.';

-- RLS on with zero policies: PostgREST requests from anon/authenticated match
-- nothing. The REVOKE below is the actual lock; this is defence in depth.
ALTER TABLE public.user_backup_pins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_backup_pins FROM PUBLIC;
REVOKE ALL ON public.user_backup_pins FROM anon;
REVOKE ALL ON public.user_backup_pins FROM authenticated;
GRANT ALL ON public.user_backup_pins TO service_role;

-- --------------------------------------------------------------------------
-- Carry across the fact that a PIN is set, without carrying the weak digest.
-- --------------------------------------------------------------------------
INSERT INTO public.user_backup_pins (user_id, pin_hash, pin_salt, algorithm)
SELECT id, NULL, NULL, 'legacy-sha256-discarded'
FROM public.users
WHERE backup_pin_hash IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- The `users.backup_pin_hash` column itself is dropped by the NEXT migration,
-- 20260815210532_drop_users_backup_pin_hash.sql. It is deliberately a separate
-- step: this migration is additive and safe to apply to a running deployment,
-- whereas the drop must not land until the application code that stopped
-- reading that column has shipped.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Note on the columns that remain readable across accounts.
--
-- `salt` stays in `public.users`. It is a per-user KDF salt, which is not a
-- secret on its own -- its exposure only mattered because the PIN hash sat
-- beside it. With `backup_pin_hash` gone there is nothing left to precompute
-- against, and /api/auth/salt already restricts callers to their own row via
-- the service role.
--
-- `phone_number` also stays readable to `authenticated`, because
-- /api/users/search deliberately matches on it (results are masked to
-- ***-***-1234 before they leave the server). That is tracked separately as a
-- Medium-severity enumeration issue, not as part of this advisory.
-- --------------------------------------------------------------------------
