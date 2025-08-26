-- Fix missing conversation participants for existing conversations
-- This migration ensures that all conversations have their intended participants properly added

-- For direct conversations, we need to identify the intended participants based on messages
-- and ensure both users are added as participants

-- Step 1: Add missing participants for direct conversations based on message senders
INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
SELECT DISTINCT 
    c.id as conversation_id,
    m.sender_id as user_id,
    'member' as role,
    NOW() as joined_at
FROM conversations c
INNER JOIN messages m ON m.conversation_id = c.id
WHERE c.type = 'direct'
  AND NOT EXISTS (
    SELECT 1 FROM conversation_participants cp 
    WHERE cp.conversation_id = c.id 
    AND cp.user_id = m.sender_id
  )
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Step 2: For conversations that still only have one participant after the above,
-- we need to add the conversation creator if they're not already a participant
INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
SELECT DISTINCT 
    c.id as conversation_id,
    c.created_by as user_id,
    'admin' as role,
    c.created_at as joined_at
FROM conversations c
WHERE c.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM conversation_participants cp 
    WHERE cp.conversation_id = c.id 
    AND cp.user_id = c.created_by
  )
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Step 3: Log the results for debugging
DO $$
DECLARE
    conversation_count INTEGER;
    participant_count INTEGER;
    conversations_with_single_participant INTEGER;
BEGIN
    -- Count total conversations
    SELECT COUNT(*) INTO conversation_count FROM conversations;
    
    -- Count total participants
    SELECT COUNT(*) INTO participant_count FROM conversation_participants;
    
    -- Count conversations with only one participant (potential issue)
    SELECT COUNT(*) INTO conversations_with_single_participant
    FROM (
        SELECT conversation_id, COUNT(*) as participant_count
        FROM conversation_participants
        GROUP BY conversation_id
        HAVING COUNT(*) = 1
    ) single_participant_conversations
    INNER JOIN conversations c ON c.id = single_participant_conversations.conversation_id
    WHERE c.type = 'direct';
    
    RAISE NOTICE 'Migration completed:';
    RAISE NOTICE '  Total conversations: %', conversation_count;
    RAISE NOTICE '  Total participants: %', participant_count;
    RAISE NOTICE '  Direct conversations with only 1 participant: %', conversations_with_single_participant;
    
    IF conversations_with_single_participant > 0 THEN
        RAISE NOTICE 'WARNING: % direct conversations still have only 1 participant. These may need manual review.', conversations_with_single_participant;
    END IF;
END $$;