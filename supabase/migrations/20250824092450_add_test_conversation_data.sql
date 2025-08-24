-- Add test conversation data for debugging
-- This migration creates test data only if there are existing auth users to reference

DO $$
DECLARE
    auth_user_record RECORD;
    test_user_id UUID := '8f9c2ef6-ed84-4b89-b48f-a56cda582aca';
    test_conversation_id UUID := '711b22e0-9676-418a-98a1-a50977805a04';
    test_participant_id UUID := '1a7f9c50-02a1-4d24-850c-5948a91105b4';
BEGIN
    -- Try to find any existing auth user
    SELECT id INTO auth_user_record FROM auth.users LIMIT 1;
    
    IF FOUND THEN
        -- Insert test user with actual auth_user_id
        INSERT INTO users (id, auth_user_id, username, display_name, phone_number, created_at, updated_at)
        VALUES (
            test_user_id,
            auth_user_record.id,
            'testuser',
            'Test User',
            '14086562473',
            NOW(),
            NOW()
        ) ON CONFLICT (id) DO UPDATE SET
            auth_user_id = EXCLUDED.auth_user_id,
            username = EXCLUDED.username,
            display_name = EXCLUDED.display_name,
            phone_number = EXCLUDED.phone_number,
            updated_at = NOW();
        
        RAISE NOTICE 'Test user created with auth_user_id: %', auth_user_record.id;
    ELSE
        -- No auth users exist, create a test user without auth_user_id
        INSERT INTO users (id, username, display_name, phone_number, created_at, updated_at)
        VALUES (
            test_user_id,
            'testuser',
            'Test User',
            '14086562473',
            NOW(),
            NOW()
        ) ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            display_name = EXCLUDED.display_name,
            phone_number = EXCLUDED.phone_number,
            updated_at = NOW();
        
        RAISE NOTICE 'Test user created without auth_user_id (no auth users found)';
    END IF;

    -- Create a test conversation
    INSERT INTO conversations (id, created_by, created_at, updated_at)
    VALUES (
        test_conversation_id,
        test_user_id,
        NOW(),
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        created_by = EXCLUDED.created_by,
        updated_at = NOW();

    -- Add the user as a participant in the conversation
    INSERT INTO conversation_participants (id, conversation_id, user_id, role, joined_at)
    VALUES (
        test_participant_id,
        test_conversation_id,
        test_user_id,
        'member',
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        role = EXCLUDED.role;

    -- Add a test message to the conversation
    INSERT INTO messages (id, conversation_id, sender_id, message_type, encrypted_content, created_at)
    VALUES (
        gen_random_uuid(),
        test_conversation_id,
        test_user_id,
        'text',
        'Hello! This is a test message.',
        NOW()
    ) ON CONFLICT DO NOTHING;

    -- Verify the data was inserted correctly
    DECLARE
        user_count INTEGER;
        conversation_count INTEGER;
        participant_count INTEGER;
        message_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO user_count FROM users WHERE id = test_user_id;
        SELECT COUNT(*) INTO conversation_count FROM conversations WHERE id = test_conversation_id;
        SELECT COUNT(*) INTO participant_count FROM conversation_participants
            WHERE conversation_id = test_conversation_id
            AND user_id = test_user_id;
        SELECT COUNT(*) INTO message_count FROM messages WHERE conversation_id = test_conversation_id;
        
        RAISE NOTICE 'Test data verification:';
        RAISE NOTICE '- Users: %', user_count;
        RAISE NOTICE '- Conversations: %', conversation_count;
        RAISE NOTICE '- Participants: %', participant_count;
        RAISE NOTICE '- Messages: %', message_count;
        
        IF user_count = 0 OR conversation_count = 0 OR participant_count = 0 THEN
            RAISE EXCEPTION 'Failed to create test data properly';
        END IF;
    END;
END $$;