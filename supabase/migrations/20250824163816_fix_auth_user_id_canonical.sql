-- Fix auth_user_id canonical ID mismatches
-- This migration addresses the issue where users.auth_user_id might contain
-- temporary IDs from the OTP sign-in process instead of canonical auth.users.id

-- First, let's create a function to help identify and fix canonical ID mismatches
CREATE OR REPLACE FUNCTION fix_canonical_auth_user_ids()
RETURNS TABLE(
    user_id UUID,
    old_auth_user_id UUID,
    new_auth_user_id UUID,
    email TEXT,
    phone_number TEXT,
    action TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- This function will help identify users whose auth_user_id might not match
    -- the canonical auth.users.id for their email/phone
    
    RETURN QUERY
    SELECT 
        u.id as user_id,
        u.auth_user_id as old_auth_user_id,
        au.id as new_auth_user_id,
        u.email,
        u.phone_number,
        CASE 
            WHEN u.auth_user_id = au.id THEN 'OK'
            WHEN u.auth_user_id != au.id THEN 'MISMATCH'
            ELSE 'UNKNOWN'
        END as action
    FROM users u
    LEFT JOIN auth.users au ON (
        (u.email IS NOT NULL AND au.email = u.email) OR
        (u.phone_number IS NOT NULL AND au.phone = u.phone_number)
    )
    WHERE au.id IS NOT NULL;
END;
$$;

-- Create a function to actually update mismatched auth_user_ids
CREATE OR REPLACE FUNCTION update_canonical_auth_user_ids()
RETURNS TABLE(
    updated_user_id UUID,
    old_auth_user_id UUID,
    new_auth_user_id UUID,
    identifier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update users table with canonical auth_user_id values
    RETURN QUERY
    WITH updates AS (
        UPDATE users u
        SET auth_user_id = au.id,
            updated_at = NOW()
        FROM auth.users au
        WHERE (
            (u.email IS NOT NULL AND au.email = u.email) OR
            (u.phone_number IS NOT NULL AND au.phone = u.phone_number)
        )
        AND u.auth_user_id != au.id
        RETURNING 
            u.id as user_id,
            u.auth_user_id as old_id,
            au.id as new_id,
            COALESCE(u.email, u.phone_number) as identifier
    )
    SELECT 
        updates.user_id,
        updates.old_id,
        updates.new_id,
        updates.identifier
    FROM updates;
END;
$$;

-- Add some helpful comments
COMMENT ON FUNCTION fix_canonical_auth_user_ids() IS 'Identifies users with potential auth_user_id mismatches due to OTP sign-in temporary IDs';
COMMENT ON FUNCTION update_canonical_auth_user_ids() IS 'Updates users.auth_user_id to use canonical auth.users.id values';

-- Create an index to help with the auth_user_id lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id_lookup ON users(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Note: We're not adding a strict foreign key constraint here because:
-- 1. During OTP sign-in, temporary IDs may be used before canonical IDs are established
-- 2. This allows for more flexible user management during the auth flow
-- 3. The application logic will ensure proper ID mapping

-- Instead, we'll add a comment to document the expected relationship
COMMENT ON COLUMN users.auth_user_id IS 'Should reference auth.users.id, but constraint is not enforced to allow for OTP sign-in flow flexibility';