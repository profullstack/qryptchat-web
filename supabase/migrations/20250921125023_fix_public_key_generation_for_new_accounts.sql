-- Fix public key generation system for new accounts
-- This migration addresses the key type mismatch and ensures proper key storage

-- 1. Update the default key type to ML-KEM-768 to match API expectations
ALTER TABLE user_public_keys 
    ALTER COLUMN key_type SET DEFAULT 'ML-KEM-768';

-- 2. Update existing function defaults to use ML-KEM-768
CREATE OR REPLACE FUNCTION get_user_public_key(target_user_id UUID, key_type_param VARCHAR(50) DEFAULT 'ML-KEM-768')
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

-- 3. Update upsert function to use ML-KEM-768 as default
CREATE OR REPLACE FUNCTION upsert_user_public_key(
    target_user_id UUID,
    public_key_param TEXT,
    key_type_param VARCHAR(50) DEFAULT 'ML-KEM-768'
)
RETURNS VOID AS $$
BEGIN
    -- Security check: Only allow users to update their own keys
    IF auth.uid() != target_user_id THEN
        RAISE EXCEPTION 'Access denied: can only update own public key';
    END IF;

    INSERT INTO user_public_keys (user_id, public_key, key_type)
    VALUES (target_user_id, public_key_param, key_type_param)
    ON CONFLICT (user_id, key_type)
    DO UPDATE SET
        public_key = EXCLUDED.public_key,
        updated_at = NOW()
        WHERE user_public_keys.user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create function to generate and store a user's public key during account creation
CREATE OR REPLACE FUNCTION auto_generate_user_public_key(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- This function is called during account creation to set up the public key record
    -- The actual key generation happens client-side for security
    -- We just create a placeholder record that will be updated when the user first visits the app
    
    -- Only create if no key exists yet
    IF NOT EXISTS (SELECT 1 FROM user_public_keys WHERE user_id = target_user_id AND key_type = 'ML-KEM-768') THEN
        INSERT INTO user_public_keys (user_id, public_key, key_type)
        VALUES (target_user_id, '', 'ML-KEM-768')
        ON CONFLICT (user_id, key_type) DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create an alternative lookup that also checks for ML-KEM-1024 keys
CREATE OR REPLACE FUNCTION get_user_public_key_any_type(target_user_id UUID)
RETURNS TABLE(public_key TEXT, key_type VARCHAR(50)) AS $$
BEGIN
    -- First try ML-KEM-768, then ML-KEM-1024, then any type
    RETURN QUERY
    SELECT upk.public_key, upk.key_type
    FROM user_public_keys upk
    WHERE upk.user_id = target_user_id
    AND upk.public_key != '' -- Ignore empty placeholder keys
    ORDER BY 
        CASE upk.key_type 
            WHEN 'ML-KEM-768' THEN 1
            WHEN 'ML-KEM-1024' THEN 2
            ELSE 3
        END
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Grant necessary permissions
GRANT EXECUTE ON FUNCTION auto_generate_user_public_key(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_public_key_any_type(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_public_key_any_type(UUID) TO service_role;

-- 7. Add comment explaining the key generation process
COMMENT ON FUNCTION auto_generate_user_public_key IS 'Creates placeholder public key record during account creation. Actual key generation happens client-side.';
COMMENT ON FUNCTION get_user_public_key_any_type IS 'Flexible public key lookup that works with both ML-KEM-768 and ML-KEM-1024 keys';