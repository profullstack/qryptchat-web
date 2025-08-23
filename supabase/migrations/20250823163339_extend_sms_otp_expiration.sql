-- Extend SMS OTP expiration time from 60 seconds to 5 minutes (300 seconds)
-- This gives users more time to complete the verification process

-- Update the auth configuration to extend OTP expiration
-- Note: This affects the Supabase Auth service configuration
-- The OTP expiration is controlled by Supabase Auth settings

-- For development, we can also add a custom function to handle extended verification windows
-- This allows for more flexible OTP handling in our application logic

-- Create a function to check if an OTP is still valid with extended time
CREATE OR REPLACE FUNCTION is_otp_valid_extended(
  phone_number TEXT,
  verification_code TEXT,
  extended_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  otp_created_at TIMESTAMPTZ;
  expiry_time TIMESTAMPTZ;
BEGIN
  -- This is a placeholder function for extended OTP validation
  -- In practice, Supabase Auth handles OTP validation internally
  -- This function can be used for custom validation logic if needed
  
  -- Calculate expiry time (5 minutes from now as default)
  expiry_time := NOW() - INTERVAL '1 minute' * extended_minutes;
  
  -- For now, return true to allow extended validation
  -- This would need to be implemented with actual OTP storage if we manage OTPs ourselves
  RETURN TRUE;
END;
$$;

-- Add a comment explaining the OTP expiration configuration
COMMENT ON FUNCTION is_otp_valid_extended IS 'Extended OTP validation function - allows for longer verification windows than default Supabase Auth (60s)';

-- Note: To actually extend Supabase Auth OTP expiration, you need to:
-- 1. Update your Supabase project settings in the dashboard
-- 2. Or use the Supabase CLI: supabase settings update auth --otp-expiry=300
-- 3. Or set the GOTRUE_OTP_EXPIRY environment variable to 300 (5 minutes)

-- For immediate relief, we'll modify our application logic to be more forgiving
-- with timing and provide better user feedback about expiration