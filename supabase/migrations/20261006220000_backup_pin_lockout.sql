-- Server-checked backup PINs with a lockout.
--
-- Backup PINs may now be as short as 4 digits. A 4-digit PIN is only safe if
-- the encrypted backup is not handed to anyone who merely holds a session:
-- restore now goes through POST /api/auth/key-backup, which checks the PIN
-- against user_backup_pins and locks out after repeated failures. These two
-- columns carry that state.

alter table public.user_backup_pins
	add column if not exists failed_attempts integer not null default 0,
	add column if not exists locked_until timestamptz;
