-- Key backups: seal v2 + close the PostgREST path around the PIN gate.
--
-- 1. seal_version marks how each key_backups row is sealed:
--      1 = legacy: ChaCha20-Poly1305 under PBKDF2(4-12 digit PIN), 100k or 600k
--          iterations. Brute-forceable offline from a DB dump (10^4..10^6 tries).
--      2 = seal v2: AES-256-GCM data key wrapped under PBKDF2-SHA256 600k of a
--          >=12 char passphrase AND under a random 160-bit recovery key; AAD
--          binds the auth user id. Sealed in the browser; the server holds no
--          key that opens it.
--    Existing rows default to 1. The app only writes 2 from now on, and the
--    user's browser re-seals a legacy row on its next sign-in (upgrade prompt).
--
-- 2. key_backups had own-row RLS policies for `authenticated` (and full table
--    grants to anon/authenticated on dev2), so any session could read its row's
--    ciphertext straight from PostgREST, skipping the PIN lockout in
--    /api/auth/key-backup. Every app path uses the service role, so the table
--    becomes service-role only, same shape as user_backup_pins/cli_auth_codes.
--
-- 3. Same for user_backup_pins (RLS on, zero policies, but anon/authenticated
--    still held table grants after the dev2 move) and the dead
--    encrypted_key_backups table (no code reads it; 0 rows on 2026-10-28).
--
-- Legacy rows are NOT deleted here. The cutoff is LEGACY_KEY_MIGRATION=off in
-- the app env (stops serving PIN backups); deleting the remaining seal_version=1
-- rows is a separate dated decision. Count them with
-- scripts/sql/key-backups-unmigrated.sql.

ALTER TABLE public.key_backups
    ADD COLUMN IF NOT EXISTS seal_version smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.key_backups.seal_version IS
    '1 = legacy PIN-sealed (weak, migrate); 2 = sealed client-side under passphrase + recovery key';

DROP POLICY IF EXISTS "Users can read own key backup" ON public.key_backups;
DROP POLICY IF EXISTS "Users can insert own key backup" ON public.key_backups;
DROP POLICY IF EXISTS "Users can update own key backup" ON public.key_backups;
DROP POLICY IF EXISTS "Users can delete own key backup" ON public.key_backups;
ALTER TABLE public.key_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.key_backups FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.key_backups TO service_role;

ALTER TABLE public.user_backup_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_backup_pins FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_backup_pins TO service_role;

DO $$
BEGIN
    IF to_regclass('public.encrypted_key_backups') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can access own key backups" ON public.encrypted_key_backups';
        EXECUTE 'ALTER TABLE public.encrypted_key_backups ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON public.encrypted_key_backups FROM PUBLIC, anon, authenticated';
        EXECUTE 'GRANT ALL ON public.encrypted_key_backups TO service_role';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
