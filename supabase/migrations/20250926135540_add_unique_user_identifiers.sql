-- Add unique user identifiers for profile sharing
-- This migration adds a unique_identifier field to users table for obfuscated user identification

-- Add unique_identifier column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_identifier TEXT UNIQUE;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_users_unique_identifier ON users(unique_identifier);

-- Create function to generate unique identifier
CREATE OR REPLACE FUNCTION generate_unique_identifier()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'; -- Exclude O, 0 for clarity
    result TEXT := '';
    i INTEGER;
    random_index INTEGER;
BEGIN
    -- Generate 8-character identifier (like QC7X9M2K)
    FOR i IN 1..8 LOOP
        random_index := floor(random() * length(chars) + 1);
        result := result || substr(chars, random_index, 1);
    END LOOP;
    
    RETURN 'QC' || result; -- Prefix with QC for QryptChat
END;
$$ LANGUAGE plpgsql;

-- Create function to ensure unique identifier generation
CREATE OR REPLACE FUNCTION ensure_unique_identifier()
RETURNS TEXT AS $$
DECLARE
    new_identifier TEXT;
    identifier_exists BOOLEAN;
BEGIN
    LOOP
        new_identifier := generate_unique_identifier();
        
        -- Check if identifier already exists
        SELECT EXISTS(SELECT 1 FROM users WHERE unique_identifier = new_identifier) INTO identifier_exists;
        
        -- If it doesn't exist, we can use it
        IF NOT identifier_exists THEN
            RETURN new_identifier;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function to auto-generate unique identifier for new users
CREATE OR REPLACE FUNCTION auto_generate_unique_identifier()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate if unique_identifier is null
    IF NEW.unique_identifier IS NULL THEN
        NEW.unique_identifier := ensure_unique_identifier();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate unique identifier on user creation
DROP TRIGGER IF EXISTS trigger_auto_generate_unique_identifier ON users;
CREATE TRIGGER trigger_auto_generate_unique_identifier
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_unique_identifier();

-- Backfill existing users with unique identifiers
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id FROM users WHERE unique_identifier IS NULL LOOP
        UPDATE users 
        SET unique_identifier = ensure_unique_identifier() 
        WHERE id = user_record.id;
    END LOOP;
END $$;

-- Add RLS policy for unique_identifier access
CREATE POLICY "Anyone can read user unique identifiers" ON users
FOR SELECT USING (true);

-- Create function to find user by unique identifier
CREATE OR REPLACE FUNCTION find_user_by_unique_identifier(identifier TEXT)
RETURNS TABLE (
    id UUID,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    website TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.bio,
        u.website
    FROM users u
    WHERE u.unique_identifier = identifier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;