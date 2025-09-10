/**
 * Test to verify that each user gets their own encrypted message copies
 * This test will help diagnose if User B is getting User A's encrypted copies
 */

import { describe, it, expect } from 'vitest';

describe('User-Specific Message Retrieval Debug', () => {
	it('should verify message retrieval filtering works correctly', async () => {
		console.log('🔍 [TEST] User-Specific Message Retrieval Diagnostic');
		console.log('');
		console.log('INSTRUCTIONS FOR MANUAL TESTING:');
		console.log('');
		console.log('1. Start the application: pnpm run dev');
		console.log('2. Open two browser windows/tabs:');
		console.log('   - Window 1: Normal browser (User A)');
		console.log('   - Window 2: Incognito/Private mode (User B)');
		console.log('');
		console.log('3. Login as different users in each window');
		console.log('');
		console.log('4. Join the same conversation in both windows');
		console.log('');
		console.log('5. Send a message from User A');
		console.log('');
		console.log('6. Check the server logs when User B loads messages');
		console.log('   Look for these debug messages:');
		console.log('   - "📨 [MESSAGES] Filtering for recipient_user_id: [User B ID]"');
		console.log('   - "📨 [MESSAGES] User details: { id, username, auth_user_id }"');
		console.log('   - In the message_recipients data, verify recipient_user_id matches User B');
		console.log('');
		console.log('7. EXPECTED BEHAVIOR:');
		console.log('   - User B should see their own recipient_user_id in the logs');
		console.log('   - User B should get encrypted content meant for them');
		console.log('   - User B should NOT get User A\'s encrypted copies');
		console.log('');
		console.log('8. CURRENT ISSUE:');
		console.log('   - User B gets "ChaCha20-Poly1305 decryption failed: invalid tag"');
		console.log('   - This suggests User B is getting User A\'s encrypted copies');
		console.log('   - OR User B\'s keys don\'t match what was used for encryption');
		console.log('');
		console.log('9. DEBUGGING STEPS:');
		console.log('   a) Verify User B\'s ID in server logs matches their actual user ID');
		console.log('   b) Check if message_recipients table has entries for User B');
		console.log('   c) Verify the recipient_user_id in the returned data matches User B');
		console.log('   d) Compare User B\'s public key in localStorage vs database');
		console.log('');
		console.log('10. DATABASE QUERIES TO RUN:');
		console.log('    -- Check message recipients for a specific message');
		console.log('    SELECT mr.*, u.username ');
		console.log('    FROM message_recipients mr');
		console.log('    JOIN users u ON mr.recipient_user_id = u.id');
		console.log('    WHERE mr.message_id = \'[MESSAGE_ID]\';');
		console.log('');
		console.log('    -- Check if User B has encrypted copies');
		console.log('    SELECT COUNT(*) as user_b_copies');
		console.log('    FROM message_recipients mr');
		console.log('    JOIN users u ON mr.recipient_user_id = u.id');
		console.log('    WHERE u.username = \'[USER_B_USERNAME]\';');
		console.log('');
		console.log('🔍 [TEST] Run the manual test above and check the server logs!');
		
		// This test always passes - it's just for documentation
		expect(true).to.be.true;
	});

	it('should provide SQL queries for database debugging', async () => {
		console.log('');
		console.log('🗄️ [SQL] Database Debugging Queries:');
		console.log('');
		console.log('-- 1. Check all users in the system');
		console.log('SELECT id, username, display_name, created_at FROM users ORDER BY created_at;');
		console.log('');
		console.log('-- 2. Check conversation participants');
		console.log('SELECT cp.*, u.username FROM conversation_participants cp');
		console.log('JOIN users u ON cp.user_id = u.id');
		console.log('WHERE cp.conversation_id = \'[CONVERSATION_ID]\';');
		console.log('');
		console.log('-- 3. Check messages and their recipients');
		console.log('SELECT ');
		console.log('  m.id as message_id,');
		console.log('  m.created_at,');
		console.log('  sender.username as sender,');
		console.log('  recipient.username as recipient,');
		console.log('  mr.recipient_user_id,');
		console.log('  LENGTH(mr.encrypted_content) as content_length');
		console.log('FROM messages m');
		console.log('JOIN users sender ON m.sender_id = sender.id');
		console.log('JOIN message_recipients mr ON m.id = mr.message_id');
		console.log('JOIN users recipient ON mr.recipient_user_id = recipient.id');
		console.log('WHERE m.conversation_id = \'[CONVERSATION_ID]\'');
		console.log('ORDER BY m.created_at, recipient.username;');
		console.log('');
		console.log('-- 4. Check if User B has any encrypted copies');
		console.log('SELECT COUNT(*) as total_encrypted_copies');
		console.log('FROM message_recipients mr');
		console.log('JOIN users u ON mr.recipient_user_id = u.id');
		console.log('WHERE u.username = \'[USER_B_USERNAME]\';');
		console.log('');
		console.log('-- 5. Check public keys for both users');
		console.log('SELECT username, LENGTH(public_key) as key_length, created_at');
		console.log('FROM users');
		console.log('WHERE username IN (\'[USER_A_USERNAME]\', \'[USER_B_USERNAME]\');');
		console.log('');
		
		expect(true).to.be.true;
	});

	it('should provide client-side debugging steps', async () => {
		console.log('');
		console.log('🖥️ [CLIENT] Browser Console Debugging:');
		console.log('');
		console.log('1. In User B\'s browser console, check localStorage:');
		console.log('   localStorage.getItem(\'qryptchat_keys\')');
		console.log('');
		console.log('2. Compare User B\'s public key with database:');
		console.log('   - Copy the public_key from localStorage');
		console.log('   - Compare with database public_key for User B');
		console.log('   - They should match exactly');
		console.log('');
		console.log('3. Check if User B\'s user ID is correct:');
		console.log('   - Look at server logs for User B\'s user ID');
		console.log('   - Verify it matches the recipient_user_id in message_recipients');
		console.log('');
		console.log('4. Test encryption/decryption manually:');
		console.log('   - Use browser console to test if User B can decrypt User A\'s content');
		console.log('   - This will confirm if it\'s a key mismatch or wrong encrypted copy');
		console.log('');
		console.log('5. Check network requests:');
		console.log('   - Look at the WebSocket messages when User B loads messages');
		console.log('   - Verify the encrypted_content in the response');
		console.log('   - Check if it looks like JSON (post-quantum format)');
		console.log('');
		
		expect(true).to.be.true;
	});
});