-- Phone Authentication System Migration
-- Creates tables for phone number verification and user management

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'offline')),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create phone_verifications table for SMS verification
CREATE TABLE IF NOT EXISTS phone_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT UNIQUE NOT NULL,
    verification_code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
    name TEXT,
    description TEXT,
    avatar_url TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create conversation_participants table
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    UNIQUE(conversation_id, user_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system')),
    encrypted_content TEXT NOT NULL,
    content_hash TEXT,
    metadata JSONB DEFAULT '{}',
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create message_status table for read receipts
CREATE TABLE IF NOT EXISTS message_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read')),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

-- Create user_presence table for online status
CREATE TABLE IF NOT EXISTS user_presence (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'offline')),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create typing_indicators table
CREATE TABLE IF NOT EXISTS typing_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_typing BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone_number ON phone_verifications(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_expires_at ON phone_verifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_status_message_id ON message_status(message_id);
CREATE INDEX IF NOT EXISTS idx_message_status_user_id ON message_status(user_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_conversation_id ON typing_indicators(conversation_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_presence_updated_at BEFORE UPDATE ON user_presence
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_typing_indicators_updated_at BEFORE UPDATE ON typing_indicators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to get user conversations with latest message
CREATE OR REPLACE FUNCTION get_user_conversations(user_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    conversation_avatar_url TEXT,
    participant_count BIGINT,
    latest_message_id UUID,
    latest_message_content TEXT,
    latest_message_sender_id UUID,
    latest_message_sender_username TEXT,
    latest_message_created_at TIMESTAMPTZ,
    unread_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as conversation_id,
        c.type as conversation_type,
        CASE 
            WHEN c.type = 'direct' THEN 
                (SELECT u.display_name FROM users u 
                 JOIN conversation_participants cp ON u.id = cp.user_id 
                 WHERE cp.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            ELSE c.name
        END as conversation_name,
        CASE 
            WHEN c.type = 'direct' THEN 
                (SELECT u.avatar_url FROM users u 
                 JOIN conversation_participants cp ON u.id = cp.user_id 
                 WHERE cp.conversation_id = c.id AND u.id != user_uuid LIMIT 1)
            ELSE c.avatar_url
        END as conversation_avatar_url,
        (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id) as participant_count,
        lm.id as latest_message_id,
        lm.encrypted_content as latest_message_content,
        lm.sender_id as latest_message_sender_id,
        lu.username as latest_message_sender_username,
        lm.created_at as latest_message_created_at,
        (SELECT COUNT(*) FROM messages m 
         LEFT JOIN message_status ms ON m.id = ms.message_id AND ms.user_id = user_uuid
         WHERE m.conversation_id = c.id 
         AND m.sender_id != user_uuid 
         AND (ms.status IS NULL OR ms.status != 'read')
         AND m.deleted_at IS NULL) as unread_count
    FROM conversations c
    JOIN conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN LATERAL (
        SELECT m.* FROM messages m 
        WHERE m.conversation_id = c.id 
        AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC 
        LIMIT 1
    ) lm ON true
    LEFT JOIN users lu ON lm.sender_id = lu.id
    WHERE cp.user_id = user_uuid 
    AND cp.left_at IS NULL
    ORDER BY COALESCE(lm.created_at, c.created_at) DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to create direct conversation
CREATE OR REPLACE FUNCTION create_direct_conversation(user1_id UUID, user2_id UUID)
RETURNS UUID AS $$
DECLARE
    conversation_id UUID;
    existing_conversation_id UUID;
BEGIN
    -- Check if direct conversation already exists
    SELECT c.id INTO existing_conversation_id
    FROM conversations c
    JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
    JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
    WHERE c.type = 'direct'
    AND cp1.user_id = user1_id
    AND cp2.user_id = user2_id
    AND cp1.left_at IS NULL
    AND cp2.left_at IS NULL;

    IF existing_conversation_id IS NOT NULL THEN
        RETURN existing_conversation_id;
    END IF;

    -- Create new conversation
    INSERT INTO conversations (type, created_by)
    VALUES ('direct', user1_id)
    RETURNING id INTO conversation_id;

    -- Add participants
    INSERT INTO conversation_participants (conversation_id, user_id)
    VALUES 
        (conversation_id, user1_id),
        (conversation_id, user2_id);

    RETURN conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Create RLS (Row Level Security) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile and profiles of users they have conversations with
CREATE POLICY "Users can read own profile" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Conversations policies
CREATE POLICY "Users can read conversations they participate in" ON conversations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = id 
            AND user_id::text = auth.uid()::text
            AND left_at IS NULL
        )
    );

-- Messages policies
CREATE POLICY "Users can read messages in their conversations" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = messages.conversation_id 
            AND user_id::text = auth.uid()::text
            AND left_at IS NULL
        )
    );

CREATE POLICY "Users can insert messages in their conversations" ON messages
    FOR INSERT WITH CHECK (
        sender_id::text = auth.uid()::text
        AND EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = messages.conversation_id 
            AND user_id::text = auth.uid()::text
            AND left_at IS NULL
        )
    );

-- Clean up expired phone verifications (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_verifications()
RETURNS void AS $$
BEGIN
    DELETE FROM phone_verifications 
    WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;