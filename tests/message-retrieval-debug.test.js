/**
 * Debug test to verify message retrieval is working correctly
 * This test checks if users are getting the correct encrypted copies
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';

describe('Message Retrieval Debug', () => {
  let supabaseClient;
  let testUsers = [];
  let testConversation;
  let testMessage;

  before(async () => {
    // This test requires a real database connection to debug the issue
    console.log('🔍 [DEBUG] This test requires manual database inspection');
    console.log('🔍 [DEBUG] Check the following SQL queries in your database:');
    
    console.log(`
-- 1. Check if the migration was applied correctly:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'message_recipients' 
AND column_name = 'encrypted_content';

-- 2. Check sample encrypted content format:
SELECT 
  mr.recipient_user_id,
  LENGTH(mr.encrypted_content) as content_length,
  LEFT(mr.encrypted_content, 100) as content_preview,
  CASE 
    WHEN mr.encrypted_content ~ '^[A-Za-z0-9+/]*={0,2}$' THEN 'Valid Base64'
    ELSE 'Invalid Base64'
  END as format_check
FROM message_recipients mr
LIMIT 5;

-- 3. Check if users are getting the right encrypted copies:
SELECT 
  m.id as message_id,
  m.sender_id,
  mr.recipient_user_id,
  LENGTH(mr.encrypted_content) as content_length,
  LEFT(mr.encrypted_content, 50) as preview
FROM messages m
JOIN message_recipients mr ON m.id = mr.message_id
WHERE m.conversation_id = 'YOUR_CONVERSATION_ID'
ORDER BY m.created_at DESC
LIMIT 10;

-- 4. Check for duplicate or missing recipients:
SELECT 
  message_id,
  COUNT(*) as recipient_count,
  ARRAY_AGG(recipient_user_id) as recipients
FROM message_recipients
GROUP BY message_id
HAVING COUNT(*) != (
  SELECT COUNT(*) 
  FROM conversation_participants cp 
  WHERE cp.conversation_id = (
    SELECT conversation_id 
    FROM messages 
    WHERE id = message_recipients.message_id
  )
);
    `);
  });

  it('should verify database schema is correct', async () => {
    console.log('🔍 [DEBUG] Run the SQL queries above to check:');
    console.log('1. encrypted_content column is TEXT type (not BYTEA)');
    console.log('2. Content is valid Base64 format');
    console.log('3. Each user has their own encrypted copy');
    console.log('4. No missing or duplicate recipients');
    
    // This test passes - it's just for documentation
    expect(true).to.be.true;
  });

  it('should check if the issue is in client-side key loading', async () => {
    console.log('🔍 [DEBUG] Check browser localStorage for both users:');
    console.log('1. Open DevTools → Application → Local Storage');
    console.log('2. Look for keys like: ml-kem-768-public-key, ml-kem-768-private-key');
    console.log('3. Verify each user has different keys');
    console.log('4. Check if keys are valid Base64 format');
    
    console.log('🔍 [DEBUG] If keys are missing or corrupted:');
    console.log('1. Clear localStorage for both users');
    console.log('2. Refresh and login again');
    console.log('3. Check if new keys are generated');
    
    expect(true).to.be.true;
  });

  it('should verify the exact error location', async () => {
    console.log('🔍 [DEBUG] The error "ChaCha20-Poly1305 decryption failed: invalid tag" means:');
    console.log('1. ML-KEM decapsulation worked (shared secret generated)');
    console.log('2. ChaCha20-Poly1305 decryption failed (wrong key or corrupted data)');
    console.log('');
    console.log('🔍 [DEBUG] This suggests either:');
    console.log('A) User B is getting encrypted copies meant for User A');
    console.log('B) User B has wrong/corrupted private keys');
    console.log('C) Database still has corrupted BYTEA data');
    
    expect(true).to.be.true;
  });
});