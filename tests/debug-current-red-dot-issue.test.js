// Debug script to check the current red dot issue in real-time
// This will show exactly what's happening with your specific data

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load .env file
config();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

console.log('🔧 Loaded environment:');
console.log(`   Supabase URL: ${SUPABASE_URL}`);
console.log(`   Service Key: ${SUPABASE_SERVICE_KEY ? 'Present' : 'Missing'}`);

describe('Debug Current Red Dot Issue', () => {
  let supabase;

  before(() => {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  });

  it('should debug the exact red dot issue you are experiencing', async () => {
    console.log('🔍 DEBUGGING CURRENT RED DOT ISSUE');
    console.log('=====================================');

    // Step 1: Check migration status
    const { data: migrations, error: migError } = await supabase
      .from('supabase_migrations')
      .select('name, executed_at')
      .like('name', '%message_status%')
      .order('executed_at', { ascending: false });

    console.log('\n📦 MIGRATION STATUS:');
    if (migrations && migrations.length > 0) {
      migrations.forEach(m => {
        console.log(`  ✅ ${m.name} - ${m.executed_at}`);
      });
    } else {
      console.log('  ❌ No message_status migrations found!');
    }

    // Step 2: Get a real user from your system
    const { data: users } = await supabase
      .from('users')
      .select('id, auth_user_id, username, phone_number')
      .limit(3);

    if (!users || users.length === 0) {
      console.log('\n❌ No users found in system');
      return;
    }

    const user = users[0]; // Use first user
    console.log(`\n👤 DEBUGGING USER: ${user.username || 'N/A'}`);
    console.log(`   Internal ID: ${user.id}`);
    console.log(`   Auth ID: ${user.auth_user_id || 'N/A'}`);

    // Step 3: Check conversations with unread counts using the function
    console.log('\n💬 CONVERSATION ANALYSIS:');
    const { data: conversations, error: convError } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: user.auth_user_id });

    if (convError) {
      console.log(`   ❌ Error getting conversations: ${convError.message}`);
      return;
    }

    console.log(`   Found ${conversations?.length || 0} conversations`);

    for (const conv of (conversations || []).slice(0, 3)) {
      console.log(`\n   📨 Conversation: ${conv.conversation_name || 'Unnamed'}`);
      console.log(`      ID: ${conv.conversation_id}`);
      console.log(`      Unread Count: ${conv.unread_count} ${conv.unread_count > 0 ? '🔴 (RED DOT!)' : '✅'}`);

      if (conv.unread_count > 0) {
        // Analyze WHY this conversation has unread messages
        console.log(`      🔍 Analyzing unread messages:`);

        // Get messages from this user that should count as unread
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select(`
            id,
            created_at,
            sender_id,
            message_status!left(status, user_id, timestamp)
          `)
          .eq('conversation_id', conv.conversation_id)
          .neq('sender_id', user.id) // Not sent by this user
          .limit(5)
          .order('created_at', { ascending: false });

        if (unreadMessages && unreadMessages.length > 0) {
          unreadMessages.forEach(msg => {
            // Find status for this user
            const userStatus = msg.message_status?.find(s => s.user_id === user.id);
            const status = userStatus?.status || 'NO_STATUS';
            const isUnread = !userStatus || userStatus.status !== 'read';

            console.log(`         • Message ${msg.id.substring(0,8)}: ${status} ${isUnread ? '(UNREAD)' : '(READ)'} - ${msg.created_at}`);
          });
        }

        // Check the exact query logic
        const { data: debugUnread } = await supabase
          .from('messages')
          .select(`
            id,
            message_status!left(status, user_id)
          `)
          .eq('conversation_id', conv.conversation_id)
          .neq('sender_id', user.id);

        let manualUnreadCount = 0;
        if (debugUnread) {
          debugUnread.forEach(msg => {
            const userStatus = msg.message_status?.find(s => s.user_id === user.id);
            const isUnread = !userStatus || userStatus.status !== 'read';
            if (isUnread) manualUnreadCount++;
          });
        }

        console.log(`         Manual count: ${manualUnreadCount} unread`);
        console.log(`         Function count: ${conv.unread_count} unread`);
        console.log(`         Match: ${manualUnreadCount === conv.unread_count ? '✅' : '❌ MISMATCH!'}`);
      }
    }

    // Step 4: Check message_status coverage
    const { data: coverage } = await supabase
      .rpc('check_message_status_coverage');

    if (coverage && coverage.length > 0) {
      const stats = coverage[0];
      console.log(`\n📊 MESSAGE STATUS COVERAGE:`);
      console.log(`   Total Messages: ${stats.total_messages}`);
      console.log(`   With Status: ${stats.messages_with_status}`);
      console.log(`   Without Status: ${stats.messages_without_status}`);
      console.log(`   Coverage: ${stats.coverage_percentage}%`);
    }

    // Step 5: Test the chat store fix
    console.log(`\n🔧 TESTING CHAT STORE FIX:`);
    
    // Simulate what happens when markMessagesAsRead is called
    const { data: testUser } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', user.auth_user_id)
      .single();

    console.log(`   Auth ID -> Internal ID conversion: ${user.auth_user_id} -> ${testUser?.id}`);
    console.log(`   Conversion working: ${testUser?.id === user.id ? '✅' : '❌'}`);

    // Step 6: Recommendations
    console.log(`\n💡 NEXT STEPS:`);
    
    if (conversations?.some(c => c.unread_count > 0)) {
      console.log(`   🔴 You have conversations showing unread counts`);
      console.log(`   📝 Try opening one of these conversations in the UI`);
      console.log(`   🔍 Check browser console for any errors`);
      console.log(`   🔄 The markMessagesAsRead() should be called automatically`);
    } else {
      console.log(`   ✅ No conversations show unread counts in database`);
      console.log(`   🤔 The red dot might be a frontend caching issue`);
      console.log(`   🔄 Try refreshing the page or clearing browser cache`);
    }
  });

  it('should provide a manual fix command', async () => {
    console.log(`
🛠️  MANUAL FIX COMMANDS (run these if needed):

-- 1. Check if backfill migration ran:
SELECT * FROM supabase_migrations WHERE name LIKE '%comprehensive_message_status_backfill%';

-- 2. Run backfill manually if needed:
SELECT backfill_all_message_status();

-- 3. Check coverage:
SELECT * FROM check_message_status_coverage();

-- 4. Force mark all old messages as read for a specific user:
UPDATE message_status 
SET status = 'read' 
WHERE user_id = 'YOUR_INTERNAL_USER_ID_HERE' 
AND status != 'read';

-- 5. Check if red dot should disappear:
SELECT user_uuid, conversation_id, unread_count 
FROM get_user_conversations_enhanced('YOUR_AUTH_USER_ID_HERE') 
WHERE unread_count > 0;
    `);
  });
});