-- Fix RLS policy for profile updates to use auth_user_id instead of id
-- The previous policy was checking auth.uid() = id, but it should check auth.uid() = auth_user_id
-- since auth_user_id is the field that stores the Supabase Auth user ID

-- Drop the incorrect policy
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Create the correct policy that checks auth_user_id
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = auth_user_id);

-- Ensure the public viewing policy is still correct
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON users;
CREATE POLICY "Public profiles are viewable by everyone" ON users
    FOR SELECT USING (true);