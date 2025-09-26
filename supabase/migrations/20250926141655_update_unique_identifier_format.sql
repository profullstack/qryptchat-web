-- Update unique identifier format to use qryptchat_ prefix
-- This migration updates the format from QC + 8 chars to qryptchat_ + 8 chars

-- Update the generate_unique_identifier function to use new format
CREATE OR REPLACE FUNCTION generate_unique_identifier()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'; -- Exclude O, 0 for clarity
    result TEXT := '';
    i INTEGER;
    random_index INTEGER;
BEGIN
    -- Generate 8-character identifier (like A1B2C3D4)
    FOR i IN 1..8 LOOP
        random_index := floor(random() * length(chars) + 1);
        result := result || substr(chars, random_index, 1);
    END LOOP;
    
    RETURN 'qryptchat_' || result; -- Prefix with qryptchat_
END;
$$ LANGUAGE plpgsql;

-- Update existing unique identifiers to new format
-- Convert QC prefixed identifiers to qryptchat_ prefixed
UPDATE users 
SET unique_identifier = 'qryptchat_' || substr(unique_identifier, 3)
WHERE unique_identifier LIKE 'QC%' AND length(unique_identifier) = 10;

-- Update the find_user_by_unique_identifier function to handle new format
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