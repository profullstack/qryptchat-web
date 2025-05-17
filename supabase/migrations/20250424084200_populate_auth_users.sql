-- Migration to populate auth.users table with existing users from public.users

-- This function will create users in auth.users for each user in public.users
CREATE OR REPLACE FUNCTION populate_auth_users()
RETURNS void AS $$
DECLARE
    user_record RECORD;
    default_password TEXT := 'ChangeMe123!'; -- Default password that users will need to reset
BEGIN
    -- Loop through each user in the public.users table
    FOR user_record IN 
        SELECT * FROM public.users
    LOOP
        -- Check if the user already exists in auth.users
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_record.email) THEN
            -- Insert the user into auth.users with a default password
            -- Note: We're using the raw SQL approach here because we need to access auth.users directly
            INSERT INTO auth.users (
                instance_id,
                id,
                aud,
                role,
                email,
                encrypted_password,
                email_confirmed_at,
                recovery_sent_at,
                last_sign_in_at,
                raw_app_meta_data,
                raw_user_meta_data,
                created_at,
                updated_at,
                confirmation_token,
                email_change,
                email_change_token_new,
                recovery_token
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', -- default instance_id
                user_record.id, -- use the same ID as in public.users
                'authenticated',
                'authenticated',
                user_record.email,
                crypt(default_password, gen_salt('bf')), -- encrypt the default password
                now(), -- email confirmed
                null,
                null,
                '{"provider":"email","providers":["email"]}',
                '{}',
                user_record.created_at,
                user_record.updated_at,
                '',
                '',
                '',
                ''
            );
            
            RAISE NOTICE 'Created auth user for %', user_record.email;
        ELSE
            RAISE NOTICE 'Auth user already exists for %', user_record.email;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Auth users population complete';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the function to populate auth.users
SELECT populate_auth_users();

-- Drop the function after use
DROP FUNCTION IF EXISTS populate_auth_users();

-- Add a comment explaining the migration
-- COMMENT ON TABLE auth.users IS 'Auth users table populated from public.users. Users will need to reset their passwords.';

-- Create a view to help monitor the sync between auth.users and public.users
CREATE OR REPLACE VIEW user_auth_status AS
SELECT 
    p.id AS public_user_id,
    p.email AS email,
    a.id AS auth_user_id,
    CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS has_auth_account,
    p.created_at AS public_created_at,
    a.created_at AS auth_created_at
FROM 
    public.users p
LEFT JOIN 
    auth.users a ON p.email = a.email;

COMMENT ON VIEW user_auth_status IS 'View to monitor sync between public.users and auth.users';