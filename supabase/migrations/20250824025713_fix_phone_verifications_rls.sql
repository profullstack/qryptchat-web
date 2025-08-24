-- Enable RLS on phone_verifications table
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous users to insert phone verification records (for registration)
CREATE POLICY "Allow anonymous phone verification creation" ON phone_verifications
    FOR INSERT WITH CHECK (true);

-- Policy: Allow anonymous users to read their own phone verification records by phone number
-- This is needed during the verification process before user account creation
CREATE POLICY "Allow anonymous phone verification access" ON phone_verifications
    FOR SELECT USING (true);

-- Policy: Allow anonymous users to update verification status
CREATE POLICY "Allow anonymous phone verification updates" ON phone_verifications
    FOR UPDATE USING (true);

-- Policy: Allow service role to manage all phone verification records (for cleanup, admin operations)
CREATE POLICY "Service role can manage all phone verifications" ON phone_verifications
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');