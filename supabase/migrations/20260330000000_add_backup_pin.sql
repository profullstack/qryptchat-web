-- Add backup_pin_hash column to users table
-- Stores a SHA-256 hash of the user's backup PIN for verification
-- The PIN itself is never stored; it's used client-side to encrypt key backups

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS backup_pin_hash TEXT;

COMMENT ON COLUMN public.users.backup_pin_hash IS 'SHA-256 hash of the user backup PIN used to verify PIN entry during key restore';
