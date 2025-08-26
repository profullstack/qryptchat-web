-- Auto-add conversation creator as participant
-- This migration ensures that when a conversation is created, the creator is automatically added as a participant

-- Create a trigger function to automatically add the creator as a participant
CREATE OR REPLACE FUNCTION auto_add_conversation_creator()
RETURNS TRIGGER AS $$
BEGIN
    -- Only add creator as participant if they have a created_by value and it's not already handled by other functions
    IF NEW.created_by IS NOT NULL THEN
        -- Insert the creator as a participant with admin role
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES (NEW.id, NEW.created_by, 'admin')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger to fire after a conversation is inserted
DROP TRIGGER IF EXISTS trigger_auto_add_conversation_creator ON conversations;
CREATE TRIGGER trigger_auto_add_conversation_creator
    AFTER INSERT ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION auto_add_conversation_creator();

-- Fix existing conversations that don't have their creators as participants
-- This will add missing participants for conversations where the creator isn't already a participant
INSERT INTO conversation_participants (conversation_id, user_id, role)
SELECT 
    c.id as conversation_id,
    c.created_by as user_id,
    'admin' as role
FROM conversations c
WHERE c.created_by IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM conversation_participants cp 
    WHERE cp.conversation_id = c.id 
    AND cp.user_id = c.created_by
    AND cp.left_at IS NULL
)
ON CONFLICT (conversation_id, user_id) DO NOTHING;