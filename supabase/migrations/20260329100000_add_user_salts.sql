-- Add salt column to users table for server-side encryption salt storage
-- Fixes #54: deterministic salt from phone number enables pre-computation attacks
ALTER TABLE users ADD COLUMN IF NOT EXISTS salt TEXT;
