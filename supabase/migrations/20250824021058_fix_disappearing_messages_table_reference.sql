-- Fix disappearing messages table reference
-- This migration fixes the table reference from user_profiles to users

-- Add global disappearing messages setting to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS default_message_retention_days INTEGER DEFAULT 30 NOT NULL;

-- Add per-conversation disappearing message settings to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS disappearing_messages_enabled BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS disappearing_messages_duration_days INTEGER;

-- Add message expiration tracking to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Create function to calculate message expiration
CREATE OR REPLACE FUNCTION calculate_message_expiration(
    conversation_id UUID,
    sender_id UUID
) RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    conv_duration INTEGER;
    user_default_duration INTEGER;
    expiration_days INTEGER;
BEGIN
    -- Get conversation-specific setting
    SELECT disappearing_messages_duration_days 
    INTO conv_duration
    FROM conversations 
    WHERE id = conversation_id AND disappearing_messages_enabled = TRUE;
    
    -- If conversation has specific setting, use it
    IF conv_duration IS NOT NULL THEN
        expiration_days := conv_duration;
    ELSE
        -- Otherwise, get user's default setting
        SELECT default_message_retention_days 
        INTO user_default_duration
        FROM users 
        WHERE id = sender_id;
        
        expiration_days := COALESCE(user_default_duration, 30);
    END IF;
    
    -- Return expiration timestamp (0 means never expire)
    IF expiration_days = 0 THEN
        RETURN NULL;
    ELSE
        RETURN NOW() + (expiration_days || ' days')::INTERVAL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically set message expiration
CREATE OR REPLACE FUNCTION set_message_expiration()
RETURNS TRIGGER AS $$
BEGIN
    NEW.expires_at := calculate_message_expiration(NEW.conversation_id, NEW.sender_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on messages table
DROP TRIGGER IF EXISTS trigger_set_message_expiration ON messages;
CREATE TRIGGER trigger_set_message_expiration
    BEFORE INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION set_message_expiration();

-- Create function to clean up expired messages
CREATE OR REPLACE FUNCTION cleanup_expired_messages()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM messages 
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_messages_expires_at 
ON messages(expires_at) 
WHERE expires_at IS NOT NULL;

-- Add RLS policies for disappearing messages settings
CREATE POLICY "Users can read their own disappearing messages settings" ON users
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own disappearing messages settings" ON users
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);