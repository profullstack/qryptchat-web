-- Add missing participants to direct conversations
-- This migration specifically addresses the issue where direct conversations have only 1 participant
-- instead of the expected 2 participants (both users in the conversation)

-- Step 1: Identify the two users in the system
DO $$
DECLARE
    user1_id UUID;
    user2_id UUID;
    user1_username TEXT;
    user2_username TEXT;
    conv1_id UUID;
    conv2_id UUID;
BEGIN
    -- Get the two users
    SELECT id, username INTO user1_id, user1_username 
    FROM users 
    WHERE username = 'profullstack' 
    LIMIT 1;
    
    SELECT id, username INTO user2_id, user2_username 
    FROM users 
    WHERE username = 'chovy' 
    LIMIT 1;
    
    -- Get the two direct conversations
    SELECT id INTO conv1_id 
    FROM conversations 
    WHERE type = 'direct' 
    ORDER BY created_at 
    LIMIT 1;
    
    SELECT id INTO conv2_id 
    FROM conversations 
    WHERE type = 'direct' 
    ORDER BY created_at DESC 
    LIMIT 1;
    
    RAISE NOTICE 'Found users: % (%), % (%)', user1_username, user1_id, user2_username, user2_id;
    RAISE NOTICE 'Found conversations: %, %', conv1_id, conv2_id;
    
    -- Check if we found the users and conversations
    IF user1_id IS NULL OR user2_id IS NULL THEN
        RAISE NOTICE 'ERROR: Could not find both users';
        RETURN;
    END IF;
    
    IF conv1_id IS NULL OR conv2_id IS NULL THEN
        RAISE NOTICE 'ERROR: Could not find both conversations';
        RETURN;
    END IF;
    
    -- Add both users to both conversations (they should be able to see each other's conversations)
    -- This ensures that both users can see the shared conversation
    
    -- Add user1 to conv1 if not already there
    INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
    VALUES (conv1_id, user1_id, 'member', NOW())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    -- Add user2 to conv1 if not already there
    INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
    VALUES (conv1_id, user2_id, 'member', NOW())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    -- Add user1 to conv2 if not already there
    INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
    VALUES (conv2_id, user1_id, 'member', NOW())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    -- Add user2 to conv2 if not already there
    INSERT INTO conversation_participants (conversation_id, user_id, role, joined_at)
    VALUES (conv2_id, user2_id, 'member', NOW())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    RAISE NOTICE 'Added participants to conversations';
END $$;

-- Step 2: Verify the fix worked
DO $$
DECLARE
    conv_count INTEGER;
    participant_count INTEGER;
    single_participant_convs INTEGER;
    multi_participant_convs INTEGER;
BEGIN
    -- Count conversations
    SELECT COUNT(*) INTO conv_count FROM conversations WHERE type = 'direct';
    
    -- Count total participants
    SELECT COUNT(*) INTO participant_count FROM conversation_participants;
    
    -- Count conversations with only 1 participant
    SELECT COUNT(*) INTO single_participant_convs
    FROM (
        SELECT conversation_id, COUNT(*) as participant_count
        FROM conversation_participants cp
        INNER JOIN conversations c ON c.id = cp.conversation_id
        WHERE c.type = 'direct'
        GROUP BY conversation_id
        HAVING COUNT(*) = 1
    ) single_participant_conversations;
    
    -- Count conversations with 2+ participants
    SELECT COUNT(*) INTO multi_participant_convs
    FROM (
        SELECT conversation_id, COUNT(*) as participant_count
        FROM conversation_participants cp
        INNER JOIN conversations c ON c.id = cp.conversation_id
        WHERE c.type = 'direct'
        GROUP BY conversation_id
        HAVING COUNT(*) >= 2
    ) multi_participant_conversations;
    
    RAISE NOTICE '=== VERIFICATION RESULTS ===';
    RAISE NOTICE 'Direct conversations: %', conv_count;
    RAISE NOTICE 'Total participants: %', participant_count;
    RAISE NOTICE 'Conversations with 1 participant: %', single_participant_convs;
    RAISE NOTICE 'Conversations with 2+ participants: %', multi_participant_convs;
    
    IF single_participant_convs = 0 THEN
        RAISE NOTICE 'SUCCESS: All direct conversations now have multiple participants!';
    ELSE
        RAISE NOTICE 'WARNING: % conversations still have only 1 participant', single_participant_convs;
    END IF;
END $$;