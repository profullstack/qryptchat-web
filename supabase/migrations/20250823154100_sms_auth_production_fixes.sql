-- SMS Authentication Production Fixes
-- Addresses common production issues with SMS authentication flow

-- Create SMS audit log table for debugging production issues
CREATE TABLE IF NOT EXISTS sms_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('send_sms', 'verify_sms', 'send_failed', 'verify_failed')),
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'warning')),
    error_code TEXT,
    error_message TEXT,
    user_agent TEXT,
    ip_address INET,
    environment TEXT DEFAULT 'production',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_sms_audit_log_phone_number ON sms_audit_log(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_audit_log_action ON sms_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_sms_audit_log_created_at ON sms_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_audit_log_status ON sms_audit_log(status);

-- Create function to log SMS events
CREATE OR REPLACE FUNCTION log_sms_event(
    p_phone_number TEXT,
    p_action TEXT,
    p_status TEXT,
    p_error_code TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_environment TEXT DEFAULT 'production',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO sms_audit_log (
        phone_number,
        action,
        status,
        error_code,
        error_message,
        user_agent,
        ip_address,
        environment,
        metadata
    ) VALUES (
        p_phone_number,
        p_action,
        p_status,
        p_error_code,
        p_error_message,
        p_user_agent,
        p_ip_address::INET,
        p_environment,
        p_metadata
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create SMS rate limiting table
CREATE TABLE IF NOT EXISTS sms_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT NOT NULL,
    attempts INTEGER DEFAULT 1,
    last_attempt TIMESTAMPTZ DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(phone_number)
);

-- Create index for rate limiting
CREATE INDEX IF NOT EXISTS idx_sms_rate_limits_phone_number ON sms_rate_limits(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_rate_limits_blocked_until ON sms_rate_limits(blocked_until);

-- Function to check and update rate limits
CREATE OR REPLACE FUNCTION check_sms_rate_limit(p_phone_number TEXT)
RETURNS JSONB AS $$
DECLARE
    rate_limit_record RECORD;
    max_attempts INTEGER := 5;
    window_minutes INTEGER := 60;
    block_minutes INTEGER := 30;
    result JSONB;
BEGIN
    -- Get or create rate limit record
    SELECT * INTO rate_limit_record
    FROM sms_rate_limits
    WHERE phone_number = p_phone_number;
    
    -- If no record exists, create one
    IF rate_limit_record IS NULL THEN
        INSERT INTO sms_rate_limits (phone_number, attempts, last_attempt)
        VALUES (p_phone_number, 1, NOW())
        RETURNING * INTO rate_limit_record;
        
        RETURN jsonb_build_object(
            'allowed', true,
            'attempts', 1,
            'max_attempts', max_attempts,
            'reset_at', NOW() + INTERVAL '1 hour'
        );
    END IF;
    
    -- Check if currently blocked
    IF rate_limit_record.blocked_until IS NOT NULL AND rate_limit_record.blocked_until > NOW() THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'rate_limited',
            'blocked_until', rate_limit_record.blocked_until,
            'attempts', rate_limit_record.attempts
        );
    END IF;
    
    -- Reset if window has passed
    IF rate_limit_record.last_attempt < NOW() - INTERVAL '1 hour' THEN
        UPDATE sms_rate_limits
        SET attempts = 1, last_attempt = NOW(), blocked_until = NULL
        WHERE phone_number = p_phone_number;
        
        RETURN jsonb_build_object(
            'allowed', true,
            'attempts', 1,
            'max_attempts', max_attempts,
            'reset_at', NOW() + INTERVAL '1 hour'
        );
    END IF;
    
    -- Check if exceeded max attempts
    IF rate_limit_record.attempts >= max_attempts THEN
        UPDATE sms_rate_limits
        SET blocked_until = NOW() + (block_minutes || ' minutes')::INTERVAL
        WHERE phone_number = p_phone_number;
        
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'max_attempts_exceeded',
            'blocked_until', NOW() + (block_minutes || ' minutes')::INTERVAL,
            'attempts', rate_limit_record.attempts
        );
    END IF;
    
    -- Increment attempts
    UPDATE sms_rate_limits
    SET attempts = attempts + 1, last_attempt = NOW()
    WHERE phone_number = p_phone_number;
    
    RETURN jsonb_build_object(
        'allowed', true,
        'attempts', rate_limit_record.attempts + 1,
        'max_attempts', max_attempts,
        'reset_at', rate_limit_record.last_attempt + INTERVAL '1 hour'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add auth_user_id to users table to link with Supabase Auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

-- Function to sync user with Supabase Auth
CREATE OR REPLACE FUNCTION sync_user_with_auth(
    p_phone_number TEXT,
    p_auth_user_id UUID,
    p_username TEXT DEFAULT NULL,
    p_display_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    user_id UUID;
    existing_user RECORD;
BEGIN
    -- Check if user already exists by phone number
    SELECT * INTO existing_user
    FROM users
    WHERE phone_number = p_phone_number;
    
    IF existing_user IS NOT NULL THEN
        -- Update existing user with auth_user_id if not set
        IF existing_user.auth_user_id IS NULL THEN
            UPDATE users
            SET auth_user_id = p_auth_user_id, updated_at = NOW()
            WHERE id = existing_user.id;
        END IF;
        
        RETURN existing_user.id;
    END IF;
    
    -- Check if user exists by auth_user_id
    SELECT * INTO existing_user
    FROM users
    WHERE auth_user_id = p_auth_user_id;
    
    IF existing_user IS NOT NULL THEN
        -- Update phone number if different
        IF existing_user.phone_number != p_phone_number THEN
            UPDATE users
            SET phone_number = p_phone_number, updated_at = NOW()
            WHERE id = existing_user.id;
        END IF;
        
        RETURN existing_user.id;
    END IF;
    
    -- Create new user if username provided
    IF p_username IS NOT NULL THEN
        INSERT INTO users (
            phone_number,
            auth_user_id,
            username,
            display_name,
            created_at,
            updated_at
        ) VALUES (
            p_phone_number,
            p_auth_user_id,
            p_username,
            COALESCE(p_display_name, p_username),
            NOW(),
            NOW()
        ) RETURNING id INTO user_id;
        
        RETURN user_id;
    END IF;
    
    -- Return NULL if no username provided for new user
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get SMS statistics for monitoring
CREATE OR REPLACE FUNCTION get_sms_stats(
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB AS $$
DECLARE
    stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_attempts', COUNT(*),
        'successful_sends', COUNT(*) FILTER (WHERE action = 'send_sms' AND status = 'success'),
        'failed_sends', COUNT(*) FILTER (WHERE action = 'send_sms' AND status = 'error'),
        'successful_verifications', COUNT(*) FILTER (WHERE action = 'verify_sms' AND status = 'success'),
        'failed_verifications', COUNT(*) FILTER (WHERE action = 'verify_sms' AND status = 'error'),
        'unique_phone_numbers', COUNT(DISTINCT phone_number),
        'error_breakdown', jsonb_object_agg(
            COALESCE(error_code, 'unknown'),
            COUNT(*) FILTER (WHERE status = 'error')
        ) FILTER (WHERE status = 'error'),
        'period_start', p_start_date,
        'period_end', p_end_date
    ) INTO stats
    FROM sms_audit_log
    WHERE created_at BETWEEN p_start_date AND p_end_date;
    
    RETURN COALESCE(stats, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean up old audit logs (run periodically)
CREATE OR REPLACE FUNCTION cleanup_sms_audit_logs(
    p_retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sms_audit_log
    WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean up old rate limit records
CREATE OR REPLACE FUNCTION cleanup_sms_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sms_rate_limits
    WHERE last_attempt < NOW() - INTERVAL '24 hours'
    AND (blocked_until IS NULL OR blocked_until < NOW());
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on new tables
ALTER TABLE sms_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS policies for SMS audit log (service role only)
CREATE POLICY "Service role can manage SMS audit logs" ON sms_audit_log
    FOR ALL USING (auth.role() = 'service_role');

-- RLS policies for SMS rate limits (service role only)
CREATE POLICY "Service role can manage SMS rate limits" ON sms_rate_limits
    FOR ALL USING (auth.role() = 'service_role');

-- Add comments for documentation
COMMENT ON TABLE sms_audit_log IS 'Audit log for SMS authentication events to help debug production issues';
COMMENT ON TABLE sms_rate_limits IS 'Rate limiting for SMS sending to prevent abuse';
COMMENT ON FUNCTION log_sms_event IS 'Log SMS authentication events for debugging and monitoring';
COMMENT ON FUNCTION check_sms_rate_limit IS 'Check and enforce SMS rate limits per phone number';
COMMENT ON FUNCTION sync_user_with_auth IS 'Sync custom user records with Supabase Auth users';
COMMENT ON FUNCTION get_sms_stats IS 'Get SMS authentication statistics for monitoring';
COMMENT ON FUNCTION cleanup_sms_audit_logs IS 'Clean up old SMS audit log entries';
COMMENT ON FUNCTION cleanup_sms_rate_limits IS 'Clean up old SMS rate limit records';