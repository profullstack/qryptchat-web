-- Encrypted Key Backups System
-- Stores user's encrypted private keys for cross-device synchronization
-- Keys are encrypted with user-derived master key (phone + PIN/password)

-- Table to store encrypted key backups
CREATE TABLE IF NOT EXISTS encrypted_key_backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL, -- For key derivation verification
    
    -- Encrypted key data
    encrypted_identity_keys BYTEA NOT NULL, -- Encrypted Dilithium identity keys
    encrypted_master_key BYTEA NOT NULL,    -- Encrypted master key for conversation keys
    
    -- Key derivation parameters
    salt BYTEA NOT NULL,                    -- Salt for PBKDF2
    iterations INTEGER NOT NULL DEFAULT 100000, -- PBKDF2 iterations
    
    -- Metadata
    key_version INTEGER NOT NULL DEFAULT 1, -- For future key rotation
    device_fingerprint TEXT,               -- Optional device identification
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one backup per user
    UNIQUE(user_id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_encrypted_key_backups_user_id ON encrypted_key_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_key_backups_phone ON encrypted_key_backups(phone_number);

-- RLS Policies
ALTER TABLE encrypted_key_backups ENABLE ROW LEVEL SECURITY;

-- Users can only access their own key backups
CREATE POLICY "Users can access own key backups" ON encrypted_key_backups
    FOR ALL USING (auth.uid() = user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_encrypted_key_backups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_encrypted_key_backups_updated_at
    BEFORE UPDATE ON encrypted_key_backups
    FOR EACH ROW
    EXECUTE FUNCTION update_encrypted_key_backups_updated_at();

-- Table to track device access for security monitoring
CREATE TABLE IF NOT EXISTS key_access_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_fingerprint TEXT,
    access_type TEXT NOT NULL CHECK (access_type IN ('backup_created', 'backup_updated', 'keys_restored', 'keys_accessed')),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for security monitoring
CREATE INDEX IF NOT EXISTS idx_key_access_log_user_id ON key_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_key_access_log_created_at ON key_access_log(created_at);

-- RLS for access log
ALTER TABLE key_access_log ENABLE ROW LEVEL SECURITY;

-- Users can only see their own access logs
CREATE POLICY "Users can view own key access logs" ON key_access_log
    FOR SELECT USING (auth.uid() = user_id);

-- Only the system can insert access logs (via service role)
CREATE POLICY "System can insert key access logs" ON key_access_log
    FOR INSERT WITH CHECK (true);

COMMENT ON TABLE encrypted_key_backups IS 'Stores encrypted user private keys for cross-device synchronization';
COMMENT ON TABLE key_access_log IS 'Logs key backup access for security monitoring';