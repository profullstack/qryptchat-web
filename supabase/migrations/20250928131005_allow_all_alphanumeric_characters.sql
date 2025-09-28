-- Allow all alphanumeric characters (0-9A-Z) in unique identifiers
-- This migration updates the character set to include 0 and O

-- Update the generate_unique_identifier function to use full alphanumeric set
CREATE OR REPLACE FUNCTION generate_unique_identifier()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; -- Full alphanumeric set
    result TEXT := '';
    i INTEGER;
    random_index INTEGER;
BEGIN
    -- Generate 8-character identifier (like A1B2C3D4)
    FOR i IN 1..8 LOOP
        random_index := floor(random() * length(chars) + 1);
        result := result || substr(chars, random_index, 1);
    END LOOP;
    
    RETURN 'qryptchat' || result; -- Prefix with qryptchat (no special characters)
END;
$$ LANGUAGE plpgsql;