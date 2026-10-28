-- How many key backups are still sealed under a PIN (seal_version 1), and how
-- weak. Counts only; never selects ciphertext.
--   docker exec -i qrypt-chat-supabase-db psql -U postgres -d postgres < scripts/sql/key-backups-unmigrated.sql
SELECT seal_version,
       CASE WHEN seal_version >= 2 THEN 'passphrase+recovery key'
            WHEN encrypted_keys::jsonb ? 'kdfIterations' THEN 'PIN, PBKDF2 600k'
            ELSE 'PIN, PBKDF2 100k' END AS sealed_with,
       count(*) AS rows,
       max(updated_at) AS newest
FROM public.key_backups
GROUP BY 1, 2
ORDER BY 1, 2;

SELECT algorithm, count(*) AS pin_rows FROM public.user_backup_pins GROUP BY 1;

SELECT count(*) AS legacy_encrypted_key_backups_rows
FROM public.encrypted_key_backups;
