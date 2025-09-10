import { describe, it } from 'vitest';

describe('Database Investigation', () => {
  it('should provide database queries to investigate the multi-user encryption issue', () => {
    console.log(`
🗄️ [DATABASE DEBUG] Run these queries in your Supabase SQL editor:

-- 1. Check all users in the system
SELECT id, username, display_name, auth_user_id FROM users ORDER BY created_at;

-- 2. Check message recipients for the conversation
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

-- 3. Count encrypted copies per user
SELECT 
  u.username,
  u.id as user_id,
  COUNT(*) as encrypted_copies
FROM message_recipients mr
JOIN users u ON mr.recipient_user_id = u.id
JOIN messages m ON mr.message_id = m.id
WHERE m.conversation_id = '00672035-e2ed-464a-ae42-7060fe23587b'
GROUP BY u.username, u.id;

-- 4. Check if encrypted content is identical (suspicious)
SELECT 
  COUNT(DISTINCT mr.encrypted_content) as unique_encrypted_contents,
  COUNT(*) as total_message_recipients
FROM message_recipients mr
JOIN messages m ON mr.message_id = m.id
WHERE m.conversation_id = '00672035-e2ed-464a-ae42-7060fe23587b';

-- 5. Sample encrypted content comparison
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
`);
  });
});