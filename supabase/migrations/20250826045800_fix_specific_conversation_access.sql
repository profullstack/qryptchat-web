-- Fix the specific conversation that's causing access issues
-- Based on the error logs: conversation e9a9632d-66a0-466e-8230-6ac4027ed140
-- Current user 8f9c2ef6-ed84-4b89-b48f-a56cda582aca should be the creator but isn't a participant

-- First, let's check what we have for this conversation
DO $$
DECLARE
    conv_record RECORD;
    participant_count INTEGER;
BEGIN
    -- Get conversation details
    SELECT * INTO conv_record 
    FROM conversations 
    WHERE id = 'e9a9632d-66a0-466e-8230-6ac4027ed140';
    
    IF FOUND THEN
        RAISE NOTICE 'Conversation found: id=%, created_by=%, type=%', 
            conv_record.id, conv_record.created_by, conv_record.type;
        
        -- Count participants
        SELECT COUNT(*) INTO participant_count
        FROM conversation_participants 
        WHERE conversation_id = 'e9a9632d-66a0-466e-8230-6ac4027ed140';
        
        RAISE NOTICE 'Current participant count: %', participant_count;
        
        -- Show current participants
        FOR conv_record IN 
            SELECT user_id, role, joined_at 
            FROM conversation_participants 
            WHERE conversation_id = 'e9a9632d-66a0-466e-8230-6ac4027ed140'
        LOOP
            RAISE NOTICE 'Participant: user_id=%, role=%, joined_at=%', 
                conv_record.user_id, conv_record.role, conv_record.joined_at;
        END LOOP;
    ELSE
        RAISE NOTICE 'Conversation not found';
    END IF;
END $$;

-- Add the creator as a participant if they're missing
INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
SELECT 
    c.id as conversation_id,
    c.created_by as user_id,
    'admin' as role,
    c.created_at as joined_at
FROM conversations c
WHERE c.id = 'e9a9632d-66a0-466e-8230-6ac4027ed140'
AND c.created_by IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM conversation_participants cp 
    WHERE cp.conversation_id = c.id 
    AND cp.user_id = c.created_by
);

-- Log the result
DO $$
DECLARE
    fixed_count INTEGER;
BEGIN
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    IF fixed_count > 0 THEN
        RAISE NOTICE 'Added creator as participant for conversation e9a9632d-66a0-466e-8230-6ac4027ed140';
    ELSE
        RAISE NOTICE 'Creator was already a participant or conversation not found';
    END IF;
END $$;