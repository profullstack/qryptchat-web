-- Key backups table for server-side encrypted key storage
-- Keys are encrypted client-side before upload; server only stores the encrypted blob
CREATE TABLE IF NOT EXISTS key_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    encrypted_keys TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT key_backups_user_id_unique UNIQUE (user_id)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_key_backups_user_id ON key_backups(user_id);

-- Enable RLS
ALTER TABLE key_backups ENABLE ROW LEVEL SECURITY;

-- Users can only read their own backup
CREATE POLICY "Users can read own key backup"
    ON key_backups FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own backup
CREATE POLICY "Users can insert own key backup"
    ON key_backups FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own backup
CREATE POLICY "Users can update own key backup"
    ON key_backups FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own backup
CREATE POLICY "Users can delete own key backup"
    ON key_backups FOR DELETE
    USING (auth.uid() = user_id);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_key_backups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER key_backups_updated_at
    BEFORE UPDATE ON key_backups
    FOR EACH ROW
    EXECUTE FUNCTION update_key_backups_updated_at();
