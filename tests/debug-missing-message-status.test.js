// Debug script to find messages missing message_status entries
// This will help identify why red dots aren't disappearing

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

describe('Debug Missing Message Status Entries', () => {
  let supabase;

  before(() => {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  });

  it('should find messages without message_status entries', async () => {
    // Find messages that don't have any message_status entries
    const { data: messagesWithoutStatus, error } = await supabase
      .from('messages')
      .select(`
        id,
        conversation_id,
        sender_id,
        created_at,
        message_status(message_id)
      `)
      .is('message_status.message_id', null)  // Messages with no status entries
      .limit(10);

    if (error) {
      console.error('Error finding messages:', error);
      return;
    }

    console.log(`📊 Found ${messagesWithoutStatus?.length || 0} messages without message_status entries`);
    
    if (messagesWithoutStatus && messagesWithoutStatus.length > 0) {
      console.log('📝 Sample messages without status:');
      messagesWithoutStatus.forEach((msg, i) => {
        console.log(`  ${i+1}. Message ${msg.id.substring(0,8)} from ${msg.created_at}`);
      });
    }

    // Get total message count
    const { count: totalMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    // Get total message_status count  
    const { count: totalStatuses } = await supabase
      .from('message_status')
      .select('*', { count: 'exact', head: true });

    console.log(`📈 Database Stats:
      Total Messages: ${totalMessages}
      Total Message Status Entries: ${totalStatuses}
      Coverage: ${totalStatuses && totalMessages ? ((totalStatuses / totalMessages) * 100).toFixed(1) : 0}%
    `);

    // This is likely why red dots aren't disappearing!
    const hasMissingEntries = (messagesWithoutStatus?.length || 0) > 0;
    console.log(`🔴 Red dot issue cause: ${hasMissingEntries ? 'Messages missing status entries!' : 'Status entries look complete'}`);
  });

  it('should test unread count calculation with missing entries', async () => {
    // Get a sample user and their conversations
    const { data: users } = await supabase
      .from('users')
      .select('id, auth_user_id, username')
      .limit(1);

    if (!users || users.length === 0) {
      console.log('No users found, skipping test');
      return;
    }

    const user = users[0];
    console.log(`👤 Testing with user: ${user.username} (${user.id.substring(0,8)})`);

    // Get conversations using the function that calculates unread counts
    const { data: conversations, error } = await supabase
      .rpc('get_user_conversations_enhanced', { user_uuid: user.auth_user_id });

    if (error) {
      console.error('Error getting conversations:', error);
      return;
    }

    console.log(`💬 User has ${conversations?.length || 0} conversations`);

    // Check which conversations have unread counts
    const conversationsWithUnread = conversations?.filter(c => c.unread_count > 0) || [];
    
    if (conversationsWithUnread.length > 0) {
      console.log(`🔴 Conversations with unread messages: ${conversationsWithUnread.length}`);
      
      for (const conv of conversationsWithUnread.slice(0, 3)) { // Check first 3
        console.log(`  📨 Conversation ${conv.conversation_id.substring(0,8)}: ${conv.unread_count} unread`);
        
        // Check what messages are causing the unread count
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select(`
            id,
            created_at,
            sender_id,
            message_status(status, user_id)
          `)
          .eq('conversation_id', conv.conversation_id)
          .neq('sender_id', user.id) // Not sent by this user
          .limit(5);

        console.log(`    📋 Recent messages:`);
        unreadMessages?.forEach(msg => {
          const hasStatus = msg.message_status && msg.message_status.length > 0;
          const status = hasStatus ? msg.message_status[0]?.status : 'NO_STATUS';
          const isUnread = !hasStatus || status !== 'read';
          
          console.log(`      • ${msg.id.substring(0,8)}: ${status} ${isUnread ? '(COUNTING AS UNREAD)' : '(read)'}`);
        });
      }
    } else {
      console.log('✅ No conversations with unread messages found');
    }
  });

  it('should show the fix needed', async () => {
    console.log(`
🔧 DIAGNOSIS COMPLETE - Here's what needs to be fixed:

1. Messages without message_status entries count as UNREAD
2. The unread count query uses: (ms.status IS NULL OR ms.status != 'read')
3. This means ANY message without a status entry appears as unread

💡 SOLUTION:
- Run a comprehensive backfill to create message_status entries for ALL existing messages
- Or update the unread count logic to handle missing entries differently

🚀 Next steps:
1. Create migration to backfill ALL missing message_status entries
2. Test that red dots disappear after opening chats
    `);
  });
});