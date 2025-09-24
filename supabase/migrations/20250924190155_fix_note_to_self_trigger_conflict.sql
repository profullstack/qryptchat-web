-- Fix Note-to-Self Trigger Conflict
-- This migration fixes the auto_create_note_to_self_conversation trigger
-- to handle constraint violations gracefully using ON CONFLICT DO NOTHING

-- Step 1: Replace the trigger function to handle conflicts gracefully
CREATE OR REPLACE FUNCTION auto_create_note_to_self_conversation()
RETURNS TRIGGER AS $$
DECLARE
    new_conversation_id UUID;
BEGIN
    -- Only create for users with valid auth_user_id (properly authenticated users)
    IF NEW.auth_user_id IS NOT NULL THEN
        -- Create note-to-self conversation with conflict handling
        INSERT INTO conversations (id, type, name, created_by, created_at, updated_at)
        VALUES (
            uuid_generate_v4(),
            'note_to_self',
            'Note to self',
            NEW.id,
            NOW(),
            NOW()
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO new_conversation_id;

        -- If conversation was created (not conflicted), add user as participant
        IF new_conversation_id IS NOT NULL THEN
            -- Add user as participant in their note-to-self conversation with conflict handling
            INSERT INTO conversation_participants (id, conversation_id, user_id, role, joined_at)
            VALUES (
                uuid_generate_v4(),
                new_conversation_id,
                NEW.id,
                'admin',
                NOW()
            )
            ON CONFLICT (conversation_id, user_id) DO NOTHING;

            RAISE NOTICE 'Created note-to-self conversation % for user %', new_conversation_id, NEW.id;
        ELSE
            -- Conversation already exists, try to add participant if missing
            SELECT id INTO new_conversation_id 
            FROM conversations 
            WHERE created_by = NEW.id AND type = 'note_to_self' 
            LIMIT 1;
            
            IF new_conversation_id IS NOT NULL THEN
                INSERT INTO conversation_participants (id, conversation_id, user_id, role, joined_at)
                VALUES (
                    uuid_generate_v4(),
                    new_conversation_id,
                    NEW.id,
                    'admin',
                    NOW()
                )
                ON CONFLICT (conversation_id, user_id) DO NOTHING;
                
                RAISE NOTICE 'Added participant to existing note-to-self conversation % for user %', new_conversation_id, NEW.id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Clean up any existing orphaned records before applying the fix
DELETE FROM conversation_participants 
WHERE user_id NOT IN (SELECT id FROM users);

-- Step 3: Clean up conversations without participants (except note-to-self)
DELETE FROM conversations 
WHERE type != 'note_to_self'
AND id NOT IN (SELECT DISTINCT conversation_id FROM conversation_participants);

-- Step 4: Ensure all existing users have note-to-self conversations and participants
-- This will handle any users that might have been missed
INSERT INTO conversations (id, type, name, created_by, created_at, updated_at)
SELECT 
    uuid_generate_v4(),
    'note_to_self',
    'Note to self',
    u.id,
    NOW(),
    NOW()
FROM users u
WHERE u.id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM conversations c 
    WHERE c.created_by = u.id AND c.type = 'note_to_self'
)
ON CONFLICT DO NOTHING;

-- Step 5: Ensure all note-to-self conversations have their creators as participants
INSERT INTO conversation_participants (id, conversation_id, user_id, role, joined_at)
SELECT 
    uuid_generate_v4(),
    c.id,
    c.created_by,
    'admin',
    c.created_at
FROM conversations c
WHERE c.type = 'note_to_self'
AND c.created_by IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = c.id AND cp.user_id = c.created_by
)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Log the fix completion
DO $$
DECLARE
    orphaned_count INTEGER;
    note_to_self_count INTEGER;
    participant_count INTEGER;
BEGIN
    -- Check for any remaining orphaned records
    SELECT COUNT(*) INTO orphaned_count
    FROM conversation_participants cp
    LEFT JOIN users u ON cp.user_id = u.id
    WHERE u.id IS NULL;
    
    SELECT COUNT(*) INTO note_to_self_count 
    FROM conversations 
    WHERE type = 'note_to_self';
    
    SELECT COUNT(*) INTO participant_count
    FROM conversation_participants cp
    JOIN conversations c ON cp.conversation_id = c.id
    WHERE c.type = 'note_to_self';
    
    RAISE NOTICE '=== NOTE-TO-SELF TRIGGER FIX COMPLETED ===';
    RAISE NOTICE 'Orphaned conversation_participants: %', orphaned_count;
    RAISE NOTICE 'Note-to-self conversations: %', note_to_self_count;
    RAISE NOTICE 'Note-to-self participants: %', participant_count;
    
    IF orphaned_count = 0 THEN
        RAISE NOTICE 'SUCCESS: No orphaned records found';
    ELSE
        RAISE NOTICE 'WARNING: % orphaned records still exist', orphaned_count;
    END IF;
END $$;