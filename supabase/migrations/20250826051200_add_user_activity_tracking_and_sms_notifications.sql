-- Add user activity tracking and SMS notification preferences

-- Add activity tracking columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN DEFAULT TRUE;

-- Create index for efficient activity queries
CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at);
CREATE INDEX IF NOT EXISTS idx_users_is_online ON users(is_online);

-- Create SMS notifications log table to track sent notifications
CREATE TABLE IF NOT EXISTS sms_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    message_content TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for SMS notifications
CREATE INDEX IF NOT EXISTS idx_sms_notifications_user_id ON sms_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_notifications_conversation_id ON sms_notifications(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sms_notifications_sent_at ON sms_notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_sms_notifications_status ON sms_notifications(status);

-- Create function to update user activity
CREATE OR REPLACE FUNCTION update_user_activity(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET 
        last_active_at = NOW(),
        is_online = TRUE
    WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to set user offline
CREATE OR REPLACE FUNCTION set_user_offline(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET is_online = FALSE
    WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user is inactive (offline for more than 5 minutes)
CREATE OR REPLACE FUNCTION is_user_inactive(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_record RECORD;
BEGIN
    SELECT last_active_at, is_online, sms_notifications_enabled
    INTO user_record
    FROM users 
    WHERE id = user_uuid;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- User is inactive if:
    -- 1. SMS notifications are enabled AND
    -- 2. User is not online OR last active more than 5 minutes ago
    RETURN user_record.sms_notifications_enabled AND (
        NOT user_record.is_online OR 
        user_record.last_active_at < NOW() - INTERVAL '5 minutes'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get inactive participants for a conversation
CREATE OR REPLACE FUNCTION get_inactive_participants(conversation_uuid UUID)
RETURNS TABLE(
    user_id UUID,
    phone_number TEXT,
    display_name TEXT,
    username TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.phone_number,
        u.display_name,
        u.username
    FROM users u
    INNER JOIN conversation_participants cp ON u.id = cp.user_id
    WHERE cp.conversation_id = conversation_uuid
    AND cp.left_at IS NULL
    AND is_user_inactive(u.id) = TRUE
    AND u.phone_number IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to log SMS notification
CREATE OR REPLACE FUNCTION log_sms_notification(
    user_uuid UUID,
    conversation_uuid UUID,
    message_uuid UUID,
    phone TEXT,
    content TEXT,
    notification_status TEXT DEFAULT 'pending',
    error_msg TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO sms_notifications (
        user_id,
        conversation_id,
        message_id,
        phone_number,
        message_content,
        status,
        error_message
    ) VALUES (
        user_uuid,
        conversation_uuid,
        message_uuid,
        phone,
        content,
        notification_status,
        error_msg
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policies for SMS notifications
ALTER TABLE sms_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own SMS notifications
CREATE POLICY "Users can view their own SMS notifications" ON sms_notifications
    FOR SELECT USING (
        user_id IN (
            SELECT id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- Only authenticated users can insert SMS notifications (for system use)
CREATE POLICY "System can insert SMS notifications" ON sms_notifications
    FOR INSERT WITH CHECK (true);

-- Users can update their SMS notification preferences
CREATE POLICY "Users can update their SMS preferences" ON users
    FOR UPDATE USING (auth_user_id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid());

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_user_activity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_user_offline(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_inactive(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_inactive_participants(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION log_sms_notification(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Initialize existing users with default activity values
UPDATE users 
SET 
    last_active_at = COALESCE(last_active_at, created_at),
    is_online = COALESCE(is_online, FALSE),
    sms_notifications_enabled = COALESCE(sms_notifications_enabled, TRUE)
WHERE last_active_at IS NULL OR is_online IS NULL OR sms_notifications_enabled IS NULL;

COMMENT ON TABLE sms_notifications IS 'Tracks SMS notifications sent to users for new messages';
COMMENT ON FUNCTION update_user_activity(UUID) IS 'Updates user last active timestamp and sets online status';
COMMENT ON FUNCTION set_user_offline(UUID) IS 'Sets user offline status';
COMMENT ON FUNCTION is_user_inactive(UUID) IS 'Checks if user is inactive and should receive SMS notifications';
COMMENT ON FUNCTION get_inactive_participants(UUID) IS 'Gets list of inactive participants in a conversation who should receive SMS';
COMMENT ON FUNCTION log_sms_notification(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) IS 'Logs an SMS notification attempt';