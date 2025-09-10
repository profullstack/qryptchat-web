import { describe, it } from 'vitest';

describe('Database Query Runner', () => {
  it('should provide step-by-step SQL queries to run in Supabase', () => {
    console.log(`
🔍 [QUERY RUNNER] Execute these queries one by one in your Supabase SQL Editor:

==================== QUERY 1: Check All Users ====================
SELECT id, username, display_name, auth_user_id FROM users ORDER BY created_at;

Expected: Should show 2 users - 'chovy' and 'profullstack' with their IDs

==================== QUERY 2: Message Recipients Analysis ====================
SELECT 
  m.id as message_id,
  m.created_at,
  sender.username as sender,
  recipient.username as recipient,
  mr.recipient_user_id,
  LENGTH(mr.encrypted_content) as content_length,
  SUBSTRING(mr.encrypted_content, 1, 50) as content_preview
FROM messages m
JOIN users sender ON m.sender_id = sender.id
JOIN message_recipients mr ON m.id = mr.message_id
JOIN users recipient ON mr.recipient_user_id = recipient.id
WHERE m.conversation_id = '00672035-e2ed-464a-ae42-7060fe23587b'
ORDER BY m.created_at, recipient.username;

Expected: Should show 56 rows (28 messages × 2 users) with different encrypted content

==================== QUERY 3: Count Encrypted Copies Per User ====================
SELECT 
  u.username,
  u.id as user_id,
  COUNT(*) as encrypted_copies
FROM message_recipients mr
JOIN users u ON mr.recipient_user_id = u.id
JOIN messages m ON mr.message_id = m.id
WHERE m.conversation_id = '00672035-e2ed-464a-ae42-7060fe23587b'
GROUP BY u.username, u.id;

Expected: Should show both users with 28 encrypted copies each

==================== QUERY 4: Check Content Uniqueness ====================
SELECT 
  COUNT(DISTINCT mr.encrypted_content) as unique_encrypted_contents,
  COUNT(*) as total_message_recipients
FROM message_recipients mr
JOIN messages m ON mr.message_id = m.id
WHERE m.conversation_id = '00672035-e2ed-464a-ae42-7060fe23587b';

Expected: unique_encrypted_contents should be 56, total should be 56
If unique_encrypted_contents < 56, then we have duplicate content (BUG!)

==================== QUERY 5: Sample Content Comparison ====================
SELECT 
  m.id as message_id,
  u.username,
  mr.recipient_user_id,
  SUBSTRING(mr.encrypted_content, 1, 100) as content_sample,
  LENGTH(mr.encrypted_content) as content_length
FROM messages m
JOIN message_recipients mr ON m.id = mr.message_id
JOIN users u ON mr.recipient_user_id = u.id
WHERE m.conversation_id = '00672035-e2ed-464a-ae42-7060fe23587b'
ORDER BY m.created_at DESC
LIMIT 10;

Expected: Should show different content_sample for same message_id but different users

🎯 [INSTRUCTIONS]
1. Run Query 1 first and share the results
2. Then run Query 2 and share the results  
3. Continue with Queries 3, 4, and 5
4. Pay special attention to Query 4 - if unique_encrypted_contents ≠ total_message_recipients, we found the bug!

📋 [WHAT TO LOOK FOR]
- Query 1: Confirm user IDs for 'chovy' and 'profullstack'
- Query 2: Check if both users have entries for each message
- Query 3: Verify both users have 28 encrypted copies
- Query 4: CRITICAL - Check if encrypted content is actually unique
- Query 5: Compare actual encrypted content between users
`);
  });
});