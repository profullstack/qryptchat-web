-- Diagnose and fix conversation participant access issues
-- This migration will identify problems and ensure all users have proper access to their conversations

-- Step 1: Diagnostic - Show current state
DO $$
DECLARE
    total_conversations INTEGER;
    total_participants INTEGER;
    conversations_without_participants INTEGER;
    participants_without_conversations INTEGER;
BEGIN
    -- Count total conversations
    SELECT COUNT(*) INTO total_conversations FROM conversations;
    
    -- Count total participants
    SELECT COUNT(*) INTO total_participants FROM conversation_participants;
    
    -- Count conversations without any participants
    SELECT COUNT(*) INTO conversations_without_participants
    FROM conversations c
    WHERE NOT EXISTS (
        SELECT 1 FROM conversation_participants cp 
        WHERE cp.conversation_id = c.id
    );
    
    -- Count participants referencing non-existent conversations
    SELECT COUNT(*) INTO participants_without_conversations
    FROM conversation_participants cp
    WHERE NOT EXISTS (
        SELECT 1 FROM conversations c 
        WHERE c.id = cp.conversation_id
    );
    
    RAISE NOTICE '=== DIAGNOSTIC RESULTS ===';
    RAISE NOTICE 'Total conversations: %', total_conversations;
    RAISE NOTICE 'Total participants: %', total_participants;
    RAISE NOTICE 'Conversations without participants: %', conversations_without_participants;
    RAISE NOTICE 'Orphaned participants: %', participants_without_conversations;
END $$;

-- Step 2: Clean up orphaned participants (participants without conversations)
DELETE FROM conversation_participants cp
WHERE NOT EXISTS (
    SELECT 1 FROM conversations c 
    WHERE c.id = cp.conversation_id
);

-- Step 3: Ensure all conversation creators are participants
INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
SELECT 
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

-- Step 4: For direct conversations, add participants based on message senders
-- This ensures both users in a direct conversation can see it
INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
SELECT DISTINCT 
    c.id as conversation_id,
    m.sender_id as user_id,
    'member' as role,
    COALESCE(MIN(m.created_at), NOW()) as joined_at
FROM conversations c
INNER JOIN messages m ON m.conversation_id = c.id
WHERE c.type = 'direct'
  AND NOT EXISTS (
    SELECT 1 FROM conversation_participants cp 
    WHERE cp.conversation_id = c.id 
    AND cp.user_id = m.sender_id
  )
GROUP BY c.id, m.sender_id
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Step 5: For conversations that still have only one participant and are direct type,
-- we need to identify the intended second participant
-- This is a more aggressive fix for conversations that may have lost participants
WITH single_participant_direct_conversations AS (
    SELECT 
        c.id as conversation_id,
        c.created_by,
        COUNT(cp.user_id) as participant_count
    FROM conversations c
    LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
    WHERE c.type = 'direct'
    GROUP BY c.id, c.created_by
    HAVING COUNT(cp.user_id) = 1
),
potential_participants AS (
    SELECT DISTINCT
        spdc.conversation_id,
        m.sender_id as potential_user_id
    FROM single_participant_direct_conversations spdc
    INNER JOIN messages m ON m.conversation_id = spdc.conversation_id
    WHERE m.sender_id != spdc.created_by
    AND NOT EXISTS (
        SELECT 1 FROM conversation_participants cp 
        WHERE cp.conversation_id = spdc.conversation_id 
        AND cp.user_id = m.sender_id
    )
)
INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
SELECT 
    pp.conversation_id,
    pp.potential_user_id,
    'member' as role,
    NOW() as joined_at
FROM potential_participants pp
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Step 6: Final diagnostic - Show results after fixes
DO $$
DECLARE
    total_conversations INTEGER;
    total_participants INTEGER;
    conversations_without_participants INTEGER;
    direct_conversations_with_one_participant INTEGER;
    fixed_conversations INTEGER;
BEGIN
    -- Count totals after fixes
    SELECT COUNT(*) INTO total_conversations FROM conversations;
    SELECT COUNT(*) INTO total_participants FROM conversation_participants;
    
    -- Count conversations still without participants
    SELECT COUNT(*) INTO conversations_without_participants
    FROM conversations c
    WHERE NOT EXISTS (
        SELECT 1 FROM conversation_participants cp 
        WHERE cp.conversation_id = c.id
    );
    
    -- Count direct conversations with only one participant (still problematic)
    SELECT COUNT(*) INTO direct_conversations_with_one_participant
    FROM (
        SELECT c.id, COUNT(cp.user_id) as participant_count
        FROM conversations c
        LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
        WHERE c.type = 'direct'
        GROUP BY c.id
        HAVING COUNT(cp.user_id) = 1
    ) single_participant_conversations;
    
    -- Calculate how many conversations were fixed
    SELECT COUNT(*) INTO fixed_conversations
    FROM (
        SELECT c.id, COUNT(cp.user_id) as participant_count
        FROM conversations c
        LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
        WHERE c.type = 'direct'
        GROUP BY c.id
        HAVING COUNT(cp.user_id) >= 2
    ) multi_participant_conversations;
    
    RAISE NOTICE '=== POST-FIX RESULTS ===';
    RAISE NOTICE 'Total conversations: %', total_conversations;
    RAISE NOTICE 'Total participants: %', total_participants;
    RAISE NOTICE 'Conversations without participants: %', conversations_without_participants;
    RAISE NOTICE 'Direct conversations with only 1 participant: %', direct_conversations_with_one_participant;
    RAISE NOTICE 'Direct conversations with 2+ participants: %', fixed_conversations;
    
    IF conversations_without_participants > 0 THEN
        RAISE NOTICE 'WARNING: % conversations still have no participants!', conversations_without_participants;
    END IF;
    
    IF direct_conversations_with_one_participant > 0 THEN
        RAISE NOTICE 'WARNING: % direct conversations still have only 1 participant', direct_conversations_with_one_participant;
    END IF;
    
    RAISE NOTICE 'Migration completed successfully!';
END $$;