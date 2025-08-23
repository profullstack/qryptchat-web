-- Fix SMS OTP expiration handling
-- This migration addresses the "Token has expired or is invalid" error
-- by improving error handling and user experience

-- ISSUE ANALYSIS:
-- The OTP expiration is controlled by Supabase Auth (default 60 seconds)
-- Local config.toml doesn't support otp_expiry configuration
-- Solution: Improve application-level error handling and user feedback

-- Create a function to track OTP verification attempts for monitoring
CREATE OR REPLACE FUNCTION log_otp_verification_attempt(
  phone_number TEXT,
  success BOOLEAN,
  error_type TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log verification attempts for monitoring and debugging
  INSERT INTO auth.audit_log_entries (
    instance_id,
    id,
    payload,
    created_at,
    ip_address
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    gen_random_uuid(),
    jsonb_build_object(
      'action', 'sms_otp_verification',
      'phone_number', phone_number,
      'success', success,
      'error_type', error_type,
      'user_agent', user_agent,
      'timestamp', NOW()
    ),
    NOW(),
    '127.0.0.1'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Fail silently if audit logging fails
    NULL;
END;
$$;

-- Create a function to provide better error messages for OTP failures
CREATE OR REPLACE FUNCTION get_otp_error_message(error_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  CASE error_code
    WHEN 'expired' THEN
      RETURN 'Your verification code has expired. Please request a new one.';
    WHEN 'invalid' THEN
      RETURN 'Invalid verification code. Please check and try again.';
    WHEN 'too_many_requests' THEN
      RETURN 'Too many attempts. Please wait before trying again.';
    ELSE
      RETURN 'Verification failed. Please try again or request a new code.';
  END CASE;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION log_otp_verification_attempt IS 'Logs SMS OTP verification attempts for monitoring and debugging';
COMMENT ON FUNCTION get_otp_error_message IS 'Provides user-friendly error messages for OTP verification failures';

-- Note: To extend OTP expiration in production, set environment variable:
-- GOTRUE_OTP_EXPIRY=300 (for 5 minutes)
--
-- GOTRUE is Supabase's authentication server (written in Go)
-- This environment variable controls how long SMS OTP codes remain valid
-- Default: 60 seconds, Recommended: 300 seconds (5 minutes)
--
-- For Supabase hosted projects: Set this in your project's environment variables
-- For self-hosted: Add to your GoTrue service configuration