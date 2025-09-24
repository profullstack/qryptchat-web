-- Simple SQL cleanup script to fix conversation_participants constraint violation
-- Run this directly in your Supabase SQL editor or via psql

-- Step 1: Find and delete orphaned conversation_participants (where user doesn't exist)
DELETE FROM conversation_participants 
WHERE user_id NOT IN (SELECT id FROM users);

-- Step 2: Find and delete duplicate conversation_participants
DELETE FROM conversation_participants a
USING conversation_participants b
WHERE a.id > b.id 
AND a.conversation_id = b.conversation_id 
AND a.user_id = b.user_id;

-- Step 3: Clean up conversations without participants (except note-to-self)
DELETE FROM conversations 
WHERE type != 'note_to_self'
AND id NOT IN (SELECT DISTINCT conversation_id FROM conversation_participants);

-- Step 4: Show final counts
SELECT 
    'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 
    'conversations' as table_name, COUNT(*) as count FROM conversations
UNION ALL
SELECT 
    'conversation_participants' as table_name, COUNT(*) as count FROM conversation_participants;

-- Step 5: Show any remaining orphaned records (should be empty)
SELECT 'orphaned_participants' as issue, COUNT(*) as count
FROM conversation_participants cp
LEFT JOIN users u ON cp.user_id = u.id
WHERE u.id IS NULL;