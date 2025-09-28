-- Remove underscore from unique identifiers to avoid special characters
-- This migration updates the format from qryptchat_ to qryptchat (no underscore)

-- Update the generate_unique_identifier function to remove underscore
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
    
    RETURN 'qryptchat' || result; -- Prefix with qryptchat (no underscore)
END;
$$ LANGUAGE plpgsql;

-- Update existing unique identifiers to remove underscore
-- Convert qryptchat_ prefixed identifiers to qryptchat prefixed (remove underscore)
UPDATE users 
SET unique_identifier = 'qryptchat' || substr(unique_identifier, 11)
WHERE unique_identifier LIKE 'qryptchat_%' AND length(unique_identifier) = 18;

-- Also update any remaining QC format identifiers to new format
UPDATE users 
SET unique_identifier = 'qryptchat' || substr(unique_identifier, 3)
WHERE unique_identifier LIKE 'QC%' AND length(unique_identifier) = 10;

-- Ensure all users have unique identifiers in the new format
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id FROM users WHERE unique_identifier IS NULL OR length(unique_identifier) != 17 LOOP
        UPDATE users 
        SET unique_identifier = (
            SELECT 'qryptchat' || string_agg(
                substr('ABCDEFGHIJKLMNPQRSTUVWXYZ123456789', floor(random() * 33 + 1)::int, 1), 
                ''
            )
            FROM generate_series(1, 8)
        )
        WHERE id = user_record.id;
    END LOOP;
END $$;