-- Fix missing conversation creators as participants
-- Add creators who are missing from conversation_participants table

INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
SELECT 
    c.id as conversation_id,
    c.created_by as user_id,
    'admin' as role,
    c.created_at as joined_at
FROM conversations c
LEFT JOIN conversation_participants cp ON (c.id = cp.conversation_id AND c.created_by = cp.user_id)
WHERE cp.user_id IS NULL  -- Creator is not in participants
AND c.created_by IS NOT NULL  -- Conversation has a creator
ON CONFLICT (conversation_id, user_id) DO NOTHING;  -- Avoid duplicates if they somehow exist

-- Log the fix
DO $$
DECLARE
    fixed_count INTEGER;
BEGIN
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE 'Added % missing conversation creators as participants', fixed_count;
END $$;