-- QryptChat Database Schema
-- Quantum-resistant end-to-end encrypted messaging application

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table - stores user profiles and public keys
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_hash TEXT UNIQUE NOT NULL, -- Hashed phone number for privacy
    username TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    
    -- Post-quantum cryptographic keys (stored as base64)
    identity_public_key TEXT NOT NULL, -- CRYSTALS-Dilithium public key
    signed_prekey_public TEXT NOT NULL, -- CRYSTALS-Kyber public key
    signed_prekey_signature TEXT NOT NULL, -- Signature of prekey
    
    -- Metadata
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    is_online BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One-time pre-keys for perfect forward secrecy
CREATE TABLE one_time_prekeys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key TEXT NOT NULL, -- CRYSTALS-Kyber public key
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, key_id)
);

-- Conversations (1:1 and group chats)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
    name TEXT, -- Group name (null for direct messages)
    description TEXT, -- Group description
    avatar_url TEXT, -- Group avatar
    
    -- Group settings
    max_participants INTEGER DEFAULT 100,
    is_public BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation participants
CREATE TABLE conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Participant role and permissions
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    can_send_messages BOOLEAN DEFAULT TRUE,
    can_add_members BOOLEAN DEFAULT FALSE,
    can_remove_members BOOLEAN DEFAULT FALSE,
    can_edit_info BOOLEAN DEFAULT FALSE,
    
    -- Participation metadata
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(conversation_id, user_id)
);

-- Messages table - stores encrypted messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Message content (all encrypted)
    encrypted_content TEXT NOT NULL, -- ChaCha20-Poly1305 encrypted message
    content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'file', 'audio', 'video')),
    
    -- Encryption metadata
    ephemeral_public_key TEXT NOT NULL, -- CRYSTALS-Kyber ephemeral public key
    message_signature TEXT NOT NULL, -- CRYSTALS-Dilithium signature
    
    -- Message metadata
    reply_to_id UUID REFERENCES messages(id),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_messages_conversation_created (conversation_id, created_at DESC),
    INDEX idx_messages_sender (sender_id)
);

-- Message delivery status
CREATE TABLE message_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(message_id, user_id)
);

-- Contacts and friend relationships
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    contact_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Contact metadata
    nickname TEXT, -- Custom name for this contact
    is_blocked BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    added_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, contact_user_id),
    CHECK (user_id != contact_user_id)
);

-- Phone verification codes for registration
CREATE TABLE verification_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_hash TEXT NOT NULL,
    code TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_verification_phone_hash (phone_hash),
    INDEX idx_verification_expires (expires_at)
);

-- File attachments (encrypted)
CREATE TABLE file_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    
    -- File metadata (encrypted)
    encrypted_filename TEXT NOT NULL,
    encrypted_mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    
    -- Storage information
    storage_path TEXT NOT NULL, -- Path in Supabase Storage
    encryption_key TEXT NOT NULL, -- File-specific encryption key (encrypted)
    
    -- Thumbnails for images/videos
    thumbnail_path TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Device keys for multi-device support
CREATE TABLE device_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT,
    
    -- Device-specific keys
    identity_public_key TEXT NOT NULL,
    signed_prekey_public TEXT NOT NULL,
    signed_prekey_signature TEXT NOT NULL,
    
    -- Device metadata
    last_active TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, device_id)
);

-- Key rotation history for security auditing
CREATE TABLE key_rotation_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_type TEXT NOT NULL CHECK (key_type IN ('identity', 'signed_prekey', 'one_time_prekey')),
    old_key_id TEXT,
    new_key_id TEXT,
    rotation_reason TEXT,
    rotated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Real-time presence tracking
CREATE TABLE user_presence (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'offline')),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Typing indicators
CREATE TABLE typing_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_typing BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(conversation_id, user_id)
);

-- Create indexes for performance
CREATE INDEX idx_users_phone_hash ON users(phone_hash);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_verification_codes_phone ON verification_codes(phone_hash, expires_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_presence_updated_at BEFORE UPDATE ON user_presence
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_typing_indicators_updated_at BEFORE UPDATE ON typing_indicators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- RLS Policies for conversations
CREATE POLICY "Users can view conversations they participate in" ON conversations
    FOR SELECT USING (
        id IN (
            SELECT conversation_id FROM conversation_participants 
            WHERE user_id::text = auth.uid()::text
        )
    );

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations" ON messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT conversation_id FROM conversation_participants 
            WHERE user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert messages in their conversations" ON messages
    FOR INSERT WITH CHECK (
        sender_id::text = auth.uid()::text AND
        conversation_id IN (
            SELECT conversation_id FROM conversation_participants 
            WHERE user_id::text = auth.uid()::text AND can_send_messages = true
        )
    );

-- Additional RLS policies would be added for other tables...

-- Create functions for common operations
CREATE OR REPLACE FUNCTION get_user_conversations(user_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.type,
        c.name,
        MAX(m.created_at) as last_message_at,
        COUNT(m.id) FILTER (WHERE m.created_at > cp.last_read_at) as unread_count
    FROM conversations c
    JOIN conversation_participants cp ON c.id = cp.conversation_id
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE cp.user_id = user_uuid
    GROUP BY c.id, c.type, c.name, cp.last_read_at
    ORDER BY last_message_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a direct conversation
CREATE OR REPLACE FUNCTION create_direct_conversation(user1_id UUID, user2_id UUID)
RETURNS UUID AS $$
DECLARE
    conversation_id UUID;
BEGIN
    -- Check if conversation already exists
    SELECT c.id INTO conversation_id
    FROM conversations c
    JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
    JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
    WHERE c.type = 'direct' 
    AND cp1.user_id = user1_id 
    AND cp2.user_id = user2_id;
    
    -- If not exists, create new conversation
    IF conversation_id IS NULL THEN
        INSERT INTO conversations (type) VALUES ('direct') RETURNING id INTO conversation_id;
        
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES 
            (conversation_id, user1_id, 'member'),
            (conversation_id, user2_id, 'member');
    END IF;
    
    RETURN conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired verification codes
CREATE OR REPLACE FUNCTION cleanup_expired_verification_codes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM verification_codes WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to rotate one-time prekeys
CREATE OR REPLACE FUNCTION rotate_one_time_prekeys(user_uuid UUID, new_keys JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- Delete old keys (keep some for pending messages)
    DELETE FROM one_time_prekeys 
    WHERE user_id = user_uuid 
    AND created_at < NOW() - INTERVAL '7 days';
    
    -- Insert new keys
    INSERT INTO one_time_prekeys (user_id, key_id, public_key)
    SELECT 
        user_uuid,
        (value->>'key_id')::INTEGER,
        value->>'public_key'
    FROM jsonb_array_elements(new_keys);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;