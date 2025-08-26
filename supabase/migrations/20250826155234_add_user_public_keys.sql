-- Add user public keys table for asymmetric encryption
-- This stores each user's public key for message encryption

-- Create user_public_keys table
CREATE TABLE IF NOT EXISTS user_public_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL, -- Base64 encoded public key
    key_type VARCHAR(50) NOT NULL DEFAULT 'ECDH-P256', -- Key algorithm type
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one public key per user per key type
    UNIQUE(user_id, key_type)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_public_keys_user_id ON user_public_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_public_keys_key_type ON user_public_keys(key_type);

-- Enable RLS
ALTER TABLE user_public_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read all public keys (they're public by nature)
CREATE POLICY "Public keys are readable by all authenticated users" ON user_public_keys
    FOR SELECT TO authenticated
    USING (true);

-- Users can only insert/update their own public keys
CREATE POLICY "Users can manage their own public keys" ON user_public_keys
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_user_public_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_public_keys_updated_at
    BEFORE UPDATE ON user_public_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_user_public_keys_updated_at();

-- Add function to get user's public key
CREATE OR REPLACE FUNCTION get_user_public_key(target_user_id UUID, key_type_param VARCHAR(50) DEFAULT 'ECDH-P256')
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT public_key 
        FROM user_public_keys 
        WHERE user_id = target_user_id 
        AND key_type = key_type_param
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add function to upsert user's public key
CREATE OR REPLACE FUNCTION upsert_user_public_key(
    target_user_id UUID,
    public_key_param TEXT,
    key_type_param VARCHAR(50) DEFAULT 'ECDH-P256'
)
RETURNS UUID AS $$
DECLARE
    result_id UUID;
BEGIN
    -- Only allow users to update their own keys
    IF auth.uid() != target_user_id THEN
        RAISE EXCEPTION 'Access denied: can only update own public key';
    END IF;

    INSERT INTO user_public_keys (user_id, public_key, key_type)
    VALUES (target_user_id, public_key_param, key_type_param)
    ON CONFLICT (user_id, key_type)
    DO UPDATE SET 
        public_key = EXCLUDED.public_key,
        updated_at = NOW()
    RETURNING id INTO result_id;
    
    RETURN result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT ON user_public_keys TO authenticated;
GRANT INSERT, UPDATE, DELETE ON user_public_keys TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_public_key(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_user_public_key(UUID, TEXT, VARCHAR) TO authenticated;